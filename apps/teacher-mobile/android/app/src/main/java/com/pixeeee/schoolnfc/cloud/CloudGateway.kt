
package com.pixeeee.schoolnfc.cloud

import android.os.Build
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.tasks.await
import com.pixeeee.schoolnfc.BuildConfig
import com.pixeeee.schoolnfc.database.AttendanceEventEntity
import com.pixeeee.schoolnfc.database.SmsOutboxEntity
import com.pixeeee.schoolnfc.device.DevicePreferences
import java.util.UUID

class CloudGateway(private val preferences: DevicePreferences) {
    private val auth = FirebaseAuth.getInstance()
    private val functions = FirebaseFunctions.getInstance("asia-southeast1")

    suspend fun signIn(email: String, password: String): Map<String, Any?> {
        val result = auth.signInWithEmailAndPassword(email.trim().lowercase(), password).await()
        return mapOf("signedIn" to true, "uid" to result.user?.uid, "email" to result.user?.email)
    }

    fun signOut() { auth.signOut(); preferences.clearAuthorization() }
    fun currentUser() = auth.currentUser

    @Suppress("UNCHECKED_CAST")
    private suspend fun call(name: String, data: Map<String, Any?>): Map<String, Any?> {
        val result = functions.getHttpsCallable(name).call(data).await().data
        return result as? Map<String, Any?> ?: error("Cloud Function $name returned an invalid response.")
    }

    suspend fun registerDevice(schoolId: String, displayName: String): Map<String, Any?> {
        val result = call("registerDevice", mapOf(
            "schoolId" to schoolId,
            "devicePublicId" to preferences.deviceId,
            "displayName" to displayName,
            "platform" to "ANDROID",
            "appVersion" to BuildConfig.VERSION_NAME,
            "androidVersion" to Build.VERSION.RELEASE,
            "manufacturer" to Build.MANUFACTURER,
            "model" to Build.MODEL,
        ))
        preferences.schoolId = schoolId
        preferences.deviceStatus = result["status"]?.toString() ?: "PENDING"
        return result
    }

    suspend fun renewLease(schoolId: String): Map<String, Any?> {
        val result = call("renewDeviceLease", mapOf("schoolId" to schoolId, "deviceId" to preferences.deviceId))
        preferences.schoolId = schoolId
        preferences.deviceStatus = "APPROVED"
        preferences.leaseId = result["leaseId"]?.toString()
        preferences.leaseExpiresAt = result["expiresAt"]?.toString()
        return result
    }

    suspend fun reserveCard(schoolId: String, studentId: String, operation: String, replacedCardId: String?): Map<String, Any?> {
        return call("reserveCard", mapOf(
            "schoolId" to schoolId, "deviceId" to preferences.deviceId, "leaseId" to requireNotNull(preferences.leaseId),
            "studentId" to studentId, "operation" to operation, "replacedCardId" to replacedCardId,
        ))
    }

    suspend fun activateCard(schoolId: String, reservationId: String, tagUidHash: String?, technologies: List<String>, capacityBytes: Int): Map<String, Any?> {
        return call("activateCard", mapOf(
            "schoolId" to schoolId, "deviceId" to preferences.deviceId, "leaseId" to requireNotNull(preferences.leaseId),
            "reservationId" to reservationId, "tagUidHash" to tagUidHash, "tagTechnologies" to technologies, "capacityBytes" to capacityBytes,
        ))
    }

    suspend fun getSnapshot(kind: String, cursor: String? = null, pageSize: Int = 250): Map<String, Any?> {
        val schoolId = requireNotNull(preferences.schoolId)
        return call("getDeviceSnapshot", mapOf(
            "schoolId" to schoolId, "deviceId" to preferences.deviceId, "leaseId" to requireNotNull(preferences.leaseId),
            "kind" to kind, "cursor" to cursor, "pageSize" to pageSize,
        ))
    }

    suspend fun ingestAttendance(events: List<AttendanceEventEntity>): Map<String, Any?> {
        val schoolId = requireNotNull(preferences.schoolId)
        return call("ingestAttendanceBatch", mapOf(
            "schoolId" to schoolId, "deviceId" to preferences.deviceId, "leaseId" to requireNotNull(preferences.leaseId),
            "batchId" to UUID.randomUUID().toString(),
            "events" to events.map { e -> mapOf(
                "eventUuid" to e.eventUuid, "idempotencyKey" to e.idempotencyKey, "studentId" to e.studentId, "cardId" to e.cardId,
                "eventType" to e.eventType, "localSchoolDate" to e.localSchoolDate, "localTimestamp" to e.localTimestamp,
                "timezone" to e.timezone, "clockTrust" to e.clockTrust, "scannerSessionId" to e.scannerSessionId,
                "smsExpectedCount" to e.smsExpectedCount,
            ) },
        ))
    }

    suspend fun ingestSmsResults(messages: List<SmsOutboxEntity>): Map<String, Any?> {
        val schoolId = requireNotNull(preferences.schoolId)
        return call("ingestSmsResults", mapOf(
            "schoolId" to schoolId, "deviceId" to preferences.deviceId, "leaseId" to requireNotNull(preferences.leaseId),
            "batchId" to UUID.randomUUID().toString(),
            "results" to messages.map { m -> mapOf(
                "messageId" to m.messageId, "attendanceEventId" to m.attendanceEventUuid, "guardianId" to m.guardianId,
                "status" to m.status, "attemptCount" to m.attemptCount, "sentAt" to m.sentAtIso,
                "deliveredAt" to m.deliveredAtIso, "lastErrorCode" to m.lastErrorCode,
            ) },
        ))
    }
}
