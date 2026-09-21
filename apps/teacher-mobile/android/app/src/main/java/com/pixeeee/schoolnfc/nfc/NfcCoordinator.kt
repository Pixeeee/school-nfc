
package com.pixeeee.schoolnfc.nfc

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import com.pixeeee.schoolnfc.attendance.AttendanceRepository
import com.pixeeee.schoolnfc.attendance.ScanOutcome
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.util.Hashing

class NfcCoordinator(
    private val activity: Activity,
    private val scope: CoroutineScope,
    private val attendance: AttendanceRepository,
    private val cloud: CloudGateway,
    private val preferences: DevicePreferences,
    private val listener: Listener,
) : NfcAdapter.ReaderCallback {
    interface Listener {
        fun onScan(outcome: ScanOutcome)
        fun onWriteState(phase: String, studentId: String?, cardId: String?, message: String?)
    }
    data class PendingWrite(val schoolId: String, val studentId: String, val reservationId: String, val cardId: String, val payload: String)
    private val adapter = NfcAdapter.getDefaultAdapter(activity)
    @Volatile private var pendingWrite: PendingWrite? = null
    @Volatile private var readerEnabled = false
    private var writerJob: Job? = null

    fun available() = adapter != null
    fun enabled() = adapter?.isEnabled == true
    fun enable() {
        val nfc = adapter ?: error("This phone does not support NFC.")
        require(nfc.isEnabled) { "Enable NFC in Android settings." }
        if (!readerEnabled) {
            nfc.enableReaderMode(activity, this, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V, null)
            readerEnabled = true
        }
    }
    fun disable() { if (readerEnabled) adapter?.disableReaderMode(activity); readerEnabled = false }
    fun cancelWrite() { writerJob?.cancel(); pendingWrite = null; listener.onWriteState("IDLE", null, null, null) }

    suspend fun prepareWrite(schoolId: String, studentId: String, operation: String, replacedCardId: String?) {
        listener.onWriteState("RESERVING", studentId, null, "Creating a one-time card reservation…")
        val result = cloud.reserveCard(schoolId, studentId, operation, replacedCardId)
        val pending = PendingWrite(schoolId, studentId, requireNotNull(result["reservationId"]?.toString()), requireNotNull(result["cardId"]?.toString()), requireNotNull(result["payload"]?.toString()))
        pendingWrite = pending
        listener.onWriteState("WAITING_FOR_TAG", studentId, pending.cardId, "Keep the blank card against the phone until activation finishes.")
        enable()
    }

    override fun onTagDiscovered(tag: Tag) {
        val write = synchronized(this) { pendingWrite?.also { pendingWrite = null } }
        if (write != null) {
            writerJob = scope.launch(Dispatchers.IO) { performWrite(tag, write) }
        } else {
            scope.launch(Dispatchers.IO) {
                val now = java.time.Instant.now().toString()
                try {
                    val raw = readPayload(tag)
                    val uidHash = preferences.schoolId?.let { Hashing.uidHash(tag.id, it) }
                    listener.onScan(attendance.processPayload(raw, uidHash))
                } catch (error: Exception) {
                    listener.onScan(ScanOutcome("REJECTED", now, reason = error.message ?: "NFC card could not be read."))
                }
            }
        }
    }

    private suspend fun performWrite(tag: Tag, pending: PendingWrite) {
        try {
            listener.onWriteState("WRITING", pending.studentId, pending.cardId, "Writing secure school credential…")
            val message = NdefMessage(arrayOf(NdefRecord.createMime("application/vnd.schoolnfc.card", pending.payload.toByteArray(Charsets.UTF_8))))
            val capacity = writeMessage(tag, message)
            listener.onWriteState("VERIFYING", pending.studentId, pending.cardId, "Reading card back for verification…")
            require(readPayload(tag) == pending.payload) { "Read-back verification did not match." }
            listener.onWriteState("ACTIVATING", pending.studentId, pending.cardId, "Activating card in Firebase…")
            cloud.activateCard(pending.schoolId, pending.reservationId, Hashing.uidHash(tag.id, pending.schoolId), tag.techList.toList(), capacity)
            pendingWrite = null
            listener.onWriteState("SUCCEEDED", pending.studentId, pending.cardId, "Card was written, verified, and activated.")
        } catch (error: Exception) {
            pendingWrite = null
            listener.onWriteState("FAILED", pending.studentId, pending.cardId, error.message ?: "Card write failed.")
        }
    }

    private fun readPayload(tag: Tag): String {
        val ndef = Ndef.get(tag) ?: throw IllegalArgumentException("Card is not NDEF formatted.")
        ndef.connect()
        return try {
            val message = ndef.ndefMessage ?: ndef.cachedNdefMessage ?: throw IllegalArgumentException("Card does not contain a School NFC record.")
            val record = message.records.firstOrNull { String(it.type, Charsets.US_ASCII) == "application/vnd.schoolnfc.card" }
                ?: message.records.firstOrNull() ?: throw IllegalArgumentException("Card is empty.")
            String(record.payload, Charsets.UTF_8)
        } finally { runCatching { ndef.close() } }
    }

    private fun writeMessage(tag: Tag, message: NdefMessage): Int {
        Ndef.get(tag)?.let { ndef ->
            ndef.connect()
            try {
                require(ndef.isWritable) { "NFC card is read-only." }
                require(ndef.maxSize >= message.toByteArray().size) { "NFC card does not have enough capacity." }
                ndef.writeNdefMessage(message)
                return ndef.maxSize
            } finally { runCatching { ndef.close() } }
        }
        val formatable = NdefFormatable.get(tag) ?: throw IllegalArgumentException("Unsupported NFC card technology.")
        formatable.connect()
        try { formatable.format(message); return message.toByteArray().size } finally { runCatching { formatable.close() } }
    }
}
