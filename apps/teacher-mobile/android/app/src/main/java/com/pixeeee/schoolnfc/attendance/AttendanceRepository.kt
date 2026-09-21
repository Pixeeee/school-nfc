
package com.pixeeee.schoolnfc.attendance

import android.content.Context
import android.os.SystemClock
import androidx.room.withTransaction
import com.google.firebase.auth.FirebaseAuth
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.database.AttendanceEventEntity
import com.pixeeee.schoolnfc.database.ScannerSessionEntity
import com.pixeeee.schoolnfc.database.SmsOutboxEntity
import com.pixeeee.schoolnfc.database.SyncOutboxEntity
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.nfc.CardPayloadCodec
import com.pixeeee.schoolnfc.util.Hashing
import com.pixeeee.schoolnfc.workers.QueueScheduler
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class AttendanceRepository(
    private val context: Context,
    private val database: AppDatabase,
    private val preferences: DevicePreferences,
) {
    private val debounce = ConcurrentHashMap<String, Long>()
    @Volatile private var activeSession: ActiveScannerSession? = null

    suspend fun startSession(schoolId: String, mode: String, sectionId: String?, customLabel: String?): ActiveScannerSession {
        require(preferences.deviceStatus == "APPROVED" && preferences.leaseValid()) { "Device authorization is missing or expired." }
        require(mode in setOf("ARRIVAL", "DISMISSAL", "CUSTOM")) { "Unsupported scanner mode." }
        val uid = requireNotNull(FirebaseAuth.getInstance().currentUser?.uid) { "Sign in is required." }
        val session = ActiveScannerSession(UUID.randomUUID().toString(), schoolId, mode, sectionId, customLabel)
        database.scannerSessions().insert(ScannerSessionEntity(session.id, schoolId, mode, sectionId, customLabel, uid, System.currentTimeMillis()))
        activeSession = session
        return session
    }

    suspend fun stopSession() {
        activeSession?.let { database.scannerSessions().stop(it.id, System.currentTimeMillis()) }
        activeSession = null
        debounce.clear()
    }

    suspend fun processPayload(rawPayload: String, tagUidHash: String?): ScanOutcome {
        val now = System.currentTimeMillis()
        val timestamp = Instant.ofEpochMilli(now).toString()
        val session = activeSession ?: return rejected(timestamp, "No scanner session is active.")
        if (!preferences.leaseValid(now)) return rejected(timestamp, "Device authorization lease has expired.")
        val payload = try { CardPayloadCodec.parse(rawPayload) } catch (error: Exception) { return rejected(timestamp, error.message ?: "Unsupported NFC card.") }
        if (preferences.schoolPublicCode != null && payload.schoolPublicCode != preferences.schoolPublicCode) return rejected(timestamp, "This card belongs to another school.")
        val tokenHash = Hashing.sha256(payload.token)
        val previous = debounce[tokenHash]
        if (previous != null && now - previous < 3_000) return ScanOutcome("DUPLICATE", timestamp, reason = "Card was already read. Remove it before tapping again.")
        debounce[tokenHash] = now

        val card = database.cards().byTokenHash(tokenHash) ?: return rejected(timestamp, "Unknown card. Synchronize or contact the registrar.")
        if (card.status != "ACTIVE") return rejected(timestamp, "Card is ${card.status.lowercase().replace('_', ' ')}.")
        if (card.tagUidHash != null && tagUidHash != null && card.tagUidHash != tagUidHash) return rejected(timestamp, "Possible copied card detected. Attendance was not recorded.")
        val student = database.students().byId(card.studentId) ?: return rejected(timestamp, "Student record is not available on this device.")
        if (student.status != "ACTIVE") return rejected(timestamp, "Student is not active.")
        if (session.sectionId != null && student.sectionId != session.sectionId) return rejected(timestamp, "Student is outside this scanner session's section.")

        val zone = ZoneId.systemDefault()
        val localDate = LocalDate.ofInstant(Instant.ofEpochMilli(now), zone).toString()
        val key = listOf(session.schoolId, student.id, localDate, session.mode).joinToString("|")
        val existing = database.attendance().byIdempotencyKey(key)
        if (existing != null) return ScanOutcome("DUPLICATE", timestamp, existing.eventUuid, student.id, student.displayName, student.studentNumber, session.mode, "Attendance was already recorded for this mode today.", existing.smsExpectedCount, student.photoPath)

        val eventUuid = UUID.randomUUID().toString()
        val routes = database.guardianRoutes().activeForStudent(student.id).filter { route -> when (session.mode) {
            "ARRIVAL" -> route.receiveArrivalSms
            "DISMISSAL" -> route.receiveDismissalSms
            else -> route.receiveCustomSms
        } }
        val template = database.smsTemplates().byEventType(session.mode)
        val eligibleRoutes = if (template?.enabled == true) routes else emptyList()
        val status = if (session.mode == "DISMISSAL") "DISMISSED" else "PRESENT"
        val event = AttendanceEventEntity(
            eventUuid = eventUuid, idempotencyKey = key, schoolId = session.schoolId, studentId = student.id, cardId = card.id,
            eventType = session.mode, status = status, localSchoolDate = localDate, localTimestamp = timestamp,
            elapsedRealtimeMs = SystemClock.elapsedRealtime(), timezone = zone.id, clockTrust = "UNKNOWN",
            deviceId = preferences.deviceId, teacherId = FirebaseAuth.getInstance().currentUser!!.uid,
            scannerSessionId = session.id, smsExpectedCount = eligibleRoutes.size, createdAtEpochMs = now,
        )

        database.withTransaction {
            database.attendance().insert(event)
            if (template != null) {
                for (route in eligibleRoutes) {
                    val messageId = UUID.randomUUID().toString()
                    val message = render(template.body, mapOf(
                        "schoolName" to (preferences.schoolName ?: "School"),
                        "studentName" to student.displayName,
                        "eventTime" to DateTimeFormatter.ofPattern("h:mm a").withZone(zone).format(Instant.ofEpochMilli(now)),
                        "eventDate" to DateTimeFormatter.ofPattern("MMMM d, uuuu").withZone(zone).format(Instant.ofEpochMilli(now)),
                        "eventType" to session.mode.lowercase().replaceFirstChar { it.uppercase() },
                        "shortReference" to eventUuid.take(8).uppercase(),
                    ))
                    database.smsOutbox().insert(SmsOutboxEntity(
                        messageId = messageId, idempotencyKey = "$eventUuid|${route.guardianId}|${template.id}", attendanceEventUuid = eventUuid,
                        guardianId = route.guardianId, encryptedPhone = route.encryptedPhone, renderedMessage = message,
                        subscriptionId = preferences.selectedSubscriptionId, createdAtEpochMs = now, updatedAtEpochMs = now,
                    ))
                }
            }
            database.syncOutbox().insert(SyncOutboxEntity(aggregateType = "ATTENDANCE_EVENT", aggregateId = eventUuid, createdAtEpochMs = now, updatedAtEpochMs = now))
        }
        QueueScheduler.scheduleSms(context)
        QueueScheduler.scheduleSync(context)
        return ScanOutcome("ACCEPTED", timestamp, eventUuid, student.id, student.displayName, student.studentNumber, session.mode, null, eligibleRoutes.size, student.photoPath)
    }

    private fun render(template: String, values: Map<String, String>): String {
        var result = template
        for ((key, value) in values) result = result.replace(Regex("\\{\\{\\s*$key\\s*}}"), value)
        return result.trim()
    }

    private fun rejected(timestamp: String, reason: String) = ScanOutcome("REJECTED", timestamp, reason = reason)
}
