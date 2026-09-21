
package com.pixeeee.schoolnfc

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.view.WindowManager
import androidx.core.content.ContextCompat
import androidx.room.withTransaction
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.pixeeee.schoolnfc.attendance.AttendanceRepository
import com.pixeeee.schoolnfc.attendance.ScanOutcome
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.database.SmsOutboxEntity
import com.pixeeee.schoolnfc.database.SyncOutboxEntity
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.nfc.NfcCoordinator
import com.pixeeee.schoolnfc.security.CryptoManager
import com.pixeeee.schoolnfc.workers.QueueScheduler
import java.time.Instant
import java.util.UUID

@CapacitorPlugin(
    name = "SchoolNfc",
    permissions = [Permission(alias = "sms", strings = [Manifest.permission.SEND_SMS, Manifest.permission.READ_PHONE_STATE])],
)
class SchoolNfcPlugin : Plugin(), NfcCoordinator.Listener {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var database: AppDatabase
    private lateinit var preferences: DevicePreferences
    private lateinit var cloud: CloudGateway
    private lateinit var attendance: AttendanceRepository
    private lateinit var nfc: NfcCoordinator
    private val crypto = CryptoManager()
    private val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70)
    @Volatile private var scanning = false
    @Volatile private var currentWritePhase = "IDLE"
    @Volatile private var currentWriteStudent: String? = null
    @Volatile private var currentWriteCard: String? = null
    @Volatile private var currentWriteMessage: String? = null

    override fun load() {
        database = AppDatabase.get(context)
        preferences = DevicePreferences(context)
        cloud = CloudGateway(preferences)
        attendance = AttendanceRepository(context, database, preferences)
        nfc = NfcCoordinator(activity, scope, attendance, cloud, preferences, this)
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        scope.launch(Dispatchers.IO) {
            database.smsOutbox().recoverStaleSending(System.currentTimeMillis(), System.currentTimeMillis() - 5 * 60_000)
            QueueScheduler.scheduleSms(context)
            QueueScheduler.scheduleSync(context)
        }
    }

    override fun handleOnResume() { super.handleOnResume(); if (scanning || currentWritePhase in listOf("WAITING_FOR_TAG", "WRITING", "VERIFYING", "ACTIVATING")) runCatching { nfc.enable() } }
    override fun handleOnPause() { nfc.disable(); super.handleOnPause() }
    override fun handleOnDestroy() { nfc.disable(); tone.release(); scope.cancel(); super.handleOnDestroy() }

    @PluginMethod fun getAuthState(call: PluginCall) {
        val user = cloud.currentUser()
        call.resolve(JSObject().put("signedIn", user != null).put("uid", user?.uid).put("email", user?.email))
    }

    @PluginMethod fun signIn(call: PluginCall) = launch(call) {
        val email = call.getString("email")?.trim()?.lowercase().orEmpty()
        val password = call.getString("password").orEmpty()
        require(android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) { "Enter a valid email address." }
        require(password.length >= 8) { "Password must contain at least 8 characters." }
        val result = cloud.signIn(email, password)
        resolve(call, result)
    }

    @PluginMethod fun signOut(call: PluginCall) {
        scope.launch(Dispatchers.IO) { runCatching { attendance.stopSession() }; cloud.signOut(); withContext(Dispatchers.Main) { call.resolve() } }
    }

    @PluginMethod fun getDeviceState(call: PluginCall) = launch(call) { call.resolve(deviceState()) }

    @PluginMethod fun registerDevice(call: PluginCall) = launch(call) {
        val schoolId = required(call, "schoolId")
        val displayName = required(call, "displayName")
        require(schoolId.length in 3..128 && displayName.length in 2..80) { "School ID and device name are invalid." }
        cloud.registerDevice(schoolId, displayName)
        val state = deviceState()
        notifyListeners("deviceStateChanged", state)
        call.resolve(state)
    }

    @PluginMethod fun renewLease(call: PluginCall) = launch(call) {
        val schoolId = required(call, "schoolId")
        cloud.renewLease(schoolId)
        QueueScheduler.scheduleSync(context)
        val state = deviceState()
        notifyListeners("deviceStateChanged", state)
        call.resolve(state)
    }

    @PluginMethod fun startScannerSession(call: PluginCall) = launch(call) {
        val schoolId = required(call, "schoolId")
        val mode = required(call, "mode")
        val session = attendance.startSession(schoolId, mode, call.getString("sectionId"), call.getString("customLabel"))
        nfc.enable(); scanning = true
        call.resolve(JSObject().put("sessionId", session.id))
    }

    @PluginMethod fun stopScannerSession(call: PluginCall) = launch(call) {
        attendance.stopSession(); scanning = false; nfc.disable(); call.resolve()
    }

    @PluginMethod fun searchStudents(call: PluginCall) = launch(call) {
        val query = required(call, "query").trim()
        require(query.length >= 2) { "Enter at least two characters." }
        val max = (call.getInt("limit") ?: 20).coerceIn(1, 50)
        val array = JSArray()
        database.students().search(query, max).forEach { student ->
            array.put(JSObject().put("id", student.id).put("displayName", student.displayName).put("studentNumber", student.studentNumber)
                .put("sectionId", student.sectionId).put("photoPath", student.photoPath).put("activeCardId", student.activeCardId))
        }
        call.resolve(JSObject().put("students", array))
    }

    @PluginMethod fun beginWriteCard(call: PluginCall) = launch(call) {
        val schoolId = required(call, "schoolId")
        val studentId = required(call, "studentId")
        val operation = required(call, "operation")
        require(operation == "NEW" || operation == "REPLACE") { "Unsupported card operation." }
        nfc.prepareWrite(schoolId, studentId, operation, call.getString("replacedCardId"))
        call.resolve(writeState())
    }

    @PluginMethod fun cancelWriteCard(call: PluginCall) { nfc.cancelWrite(); call.resolve() }
    @PluginMethod fun getCardWriteState(call: PluginCall) { call.resolve(writeState()) }

    @PluginMethod fun requestSmsPermission(call: PluginCall) {
        if (getPermissionState("sms") == PermissionState.GRANTED) call.resolve(JSObject().put("granted", true))
        else requestPermissionForAlias("sms", call, "smsPermissionCallback")
    }

    @PermissionCallback fun smsPermissionCallback(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState("sms") == PermissionState.GRANTED))
    }

    @PluginMethod fun listSubscriptions(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Phone permission is required to select the SMS SIM."); return
        }
        val manager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
        val array = JSArray()
        runCatching { manager.activeSubscriptionInfoList ?: emptyList<SubscriptionInfo>() }.getOrDefault(emptyList()).forEach { info ->
            array.put(JSObject().put("subscriptionId", info.subscriptionId).put("displayName", info.displayName?.toString() ?: "SIM ${info.simSlotIndex + 1}")
                .put("carrierName", info.carrierName?.toString() ?: "Unknown carrier").put("slotIndex", info.simSlotIndex).put("active", true))
        }
        call.resolve(JSObject().put("subscriptions", array))
    }

    @PluginMethod fun selectSubscription(call: PluginCall) {
        val id = call.getInt("subscriptionId") ?: return call.reject("Subscription ID is required.")
        preferences.selectedSubscriptionId = id
        call.resolve()
    }

    @PluginMethod fun sendTestSms(call: PluginCall) = launch(call) {
        val phone = normalizePhone(required(call, "phone"))
        val message = required(call, "message").trim()
        require(message.isNotEmpty() && message.length <= 480) { "Test message is invalid." }
        val subscription = preferences.selectedSubscriptionId ?: error("Select a designated SMS SIM first.")
        require(ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) { "SMS permission has not been granted." }
        val now = System.currentTimeMillis(); val id = UUID.randomUUID().toString()
        database.smsOutbox().insert(SmsOutboxEntity(
            messageId = id, idempotencyKey = "TEST|$id", attendanceEventUuid = UUID.randomUUID().toString(), guardianId = "TEST",
            encryptedPhone = crypto.encrypt(phone), renderedMessage = message, subscriptionId = subscription, cloudDirty = false,
            createdAtEpochMs = now, updatedAtEpochMs = now,
        ))
        QueueScheduler.scheduleSms(context)
        call.resolve(JSObject().put("messageId", id))
    }

    @PluginMethod fun getQueueSummary(call: PluginCall) = launch(call) { call.resolve(queueState()) }
    @PluginMethod fun retryFailedMessages(call: PluginCall) = launch(call) {
        val count = database.smsOutbox().retryAll(System.currentTimeMillis()); QueueScheduler.scheduleSms(context)
        call.resolve(JSObject().put("queued", count))
    }
    @PluginMethod fun synchronizeNow(call: PluginCall) = launch(call) {
        val count = database.syncOutbox().pendingCount(); QueueScheduler.scheduleSync(context); call.resolve(JSObject().put("queued", count))
    }

    override fun onScan(outcome: ScanOutcome) {
        activity.runOnUiThread {
            feedback(outcome.status)
            val json = JSObject().put("status", outcome.status).put("localTimestamp", outcome.localTimestamp).put("eventUuid", outcome.eventUuid)
                .put("studentId", outcome.studentId).put("displayName", outcome.displayName).put("studentNumber", outcome.studentNumber)
                .put("eventType", outcome.eventType).put("reason", outcome.reason).put("smsQueued", outcome.smsQueued).put("photoPath", outcome.photoPath)
            notifyListeners("scanResult", json)
            scope.launch { notifyListeners("queueStateChanged", queueState()) }
        }
    }

    override fun onWriteState(phase: String, studentId: String?, cardId: String?, message: String?) {
        currentWritePhase = phase; currentWriteStudent = studentId; currentWriteCard = cardId; currentWriteMessage = message
        activity.runOnUiThread { notifyListeners("cardWriteStateChanged", writeState()) }
    }

    private suspend fun deviceState(): JSObject = withContext(Dispatchers.IO) {
        JSObject().put("deviceId", preferences.deviceId).put("status", preferences.deviceStatus).put("schoolId", preferences.schoolId)
            .put("leaseId", preferences.leaseId).put("leaseExpiresAt", preferences.leaseExpiresAt).put("nfcAvailable", nfc.available())
            .put("nfcEnabled", nfc.enabled()).put("smsPermission", ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED)
            .put("selectedSubscriptionId", preferences.selectedSubscriptionId).put("syncPending", database.syncOutbox().pendingCount()).put("smsPending", database.smsOutbox().pendingCount())
    }

    private suspend fun queueState(): JSObject = withContext(Dispatchers.IO) {
        JSObject().put("smsPending", database.smsOutbox().pendingCount()).put("smsRetry", database.smsOutbox().retryCount())
            .put("smsFailed", database.smsOutbox().failedCount()).put("syncPending", database.syncOutbox().pendingCount())
    }

    private fun writeState() = JSObject().put("phase", currentWritePhase).put("studentId", currentWriteStudent).put("cardId", currentWriteCard).put("message", currentWriteMessage)

    private fun feedback(status: String) {
        val success = status == "ACCEPTED"
        tone.startTone(if (success) ToneGenerator.TONE_PROP_ACK else ToneGenerator.TONE_PROP_NACK, if (success) 110 else 180)
        val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(if (success) 70 else 160, VibrationEffect.DEFAULT_AMPLITUDE))
        else vibrateLegacy(vibrator, if (success) 70 else 160)
    }

    @Suppress("DEPRECATION")
    private fun vibrateLegacy(vibrator: Vibrator, duration: Long) { vibrator.vibrate(duration) }

    private fun normalizePhone(input: String): String {
        val compact = input.trim().replace(Regex("[\\s()-]"), "")
        val normalized = when {
            Regex("^09\\d{9}$").matches(compact) -> "+63${compact.drop(1)}"
            Regex("^9\\d{9}$").matches(compact) -> "+63$compact"
            Regex("^639\\d{9}$").matches(compact) -> "+$compact"
            else -> compact
        }
        require(Regex("^\\+639\\d{9}$").matches(normalized)) { "Enter a valid Philippine mobile number." }
        return normalized
    }

    private fun required(call: PluginCall, key: String): String = call.getString(key)?.takeIf { it.isNotBlank() } ?: throw IllegalArgumentException("$key is required.")

    private fun resolve(call: PluginCall, map: Map<String, Any?>) {
        val json = JSObject(); map.forEach { (key, value) -> json.put(key, value) }; call.resolve(json)
    }

    private fun launch(call: PluginCall, block: suspend () -> Unit) {
        scope.launch {
            try { withContext(Dispatchers.IO) { block() } }
            catch (error: Exception) { call.reject(error.message ?: "Operation failed.", error) }
        }
    }
}
