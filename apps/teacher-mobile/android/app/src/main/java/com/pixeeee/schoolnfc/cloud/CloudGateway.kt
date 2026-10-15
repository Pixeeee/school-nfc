
package com.pixeeee.schoolnfc.cloud

import android.os.Build
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Source
import com.pixeeee.schoolnfc.attendance.TeacherSmsProfile
import kotlinx.coroutines.tasks.await
import com.pixeeee.schoolnfc.BuildConfig
import com.pixeeee.schoolnfc.database.AttendanceEventEntity
import com.pixeeee.schoolnfc.database.SmsOutboxEntity
import com.pixeeee.schoolnfc.device.DevicePreferences
import java.util.UUID

class CloudGateway(private val preferences: DevicePreferences) {
    private val auth = FirebaseAuth.getInstance()
    private val functions = FirebaseFunctions.getInstance("asia-southeast1")

    init { if (preferences.leaseId != null && (preferences.authorizationBackend != preferences.backend || preferences.authorizationUserId != auth.currentUser?.uid)) preferences.clearAuthorization() }

    suspend fun signIn(identifier: String, password: String): Map<String, Any?> {
        val result = if (BuildConfig.FIREBASE_SPARK) {
            val login = PortalLoginClient.signIn(identifier, password)
            val session = auth.signInWithCustomToken(login.first).await()
            preferences.clearAuthorization()
            preferences.schoolId = login.second
            session
        } else auth.signInWithEmailAndPassword(identifier.trim().lowercase(), password).await()
        preferences.clearAuthorization()
        if (BuildConfig.FIREBASE_SPARK) renewLease(requireNotNull(preferences.schoolId))
        return mapOf("signedIn" to true, "uid" to result.user?.uid, "email" to result.user?.email)
    }

    fun signOut() { auth.signOut(); preferences.clearAuthorization() }
    fun currentUser() = auth.currentUser

    suspend fun getTeacherProfile(): Map<String, Any?> {
        val owner = requireNotNull(auth.currentUser) { "Sign in first." }
        val schoolId = requireNotNull(preferences.schoolId) { "Sign in to your school first." }
        val root = FirebaseFirestore.getInstance().collection("schools").document(schoolId)
        val profile = try {
            val saved = root.collection("teacherSmsProfiles").document(owner.uid).get(Source.SERVER).await()
            if (saved.exists()) TeacherSmsProfile.validated(saved.getString("username").orEmpty(), saved.getString("schoolName").orEmpty(), saved.getString("attendanceTemplate").orEmpty(), saved.getString("dismissalTemplate").orEmpty())
            else {
                val member = root.collection("members").document(owner.uid).get(Source.SERVER).await()
                val school = root.get(Source.SERVER).await()
                TeacherSmsProfile.validated(member.getString("username") ?: owner.email?.substringBefore('@') ?: "Teacher", school.getString("name") ?: "School")
            }
        } catch (error: FirebaseFirestoreException) {
            if (error.code !in setOf(FirebaseFirestoreException.Code.UNAVAILABLE, FirebaseFirestoreException.Code.DEADLINE_EXCEEDED)) throw error
            preferences.teacherSmsProfile(owner.uid, schoolId) ?: throw error
        }
        require(auth.currentUser?.uid == owner.uid && preferences.schoolId == schoolId) { "The signed-in teacher changed. Open Settings again." }
        preferences.cacheTeacherSmsProfile(owner.uid, profile, schoolId)
        return profile.values()
    }

    suspend fun saveTeacherProfile(username: String, schoolName: String, attendanceTemplate: String = "", dismissalTemplate: String = ""): Map<String, Any?> {
        val owner = requireNotNull(auth.currentUser?.uid) { "Sign in first." }
        val schoolId = requireNotNull(preferences.schoolId) { "Sign in to your school first." }
        val profile = TeacherSmsProfile.validated(username, schoolName, attendanceTemplate, dismissalTemplate)
        val db = FirebaseFirestore.getInstance()
        val ref = db.collection("schools").document(schoolId).collection("teacherSmsProfiles").document(owner)
        ref.get(Source.SERVER).await()
        // Transactions fail offline instead of leaving an unconfirmed profile write queued.
        db.runTransaction { tx ->
            tx.get(ref)
            tx.set(ref, profile.values() + ("updatedAt" to FieldValue.serverTimestamp()))
            true
        }.await()
        require(auth.currentUser?.uid == owner && preferences.schoolId == schoolId) { "The signed-in teacher changed. Open Settings again." }
        preferences.cacheTeacherSmsProfile(owner, profile, schoolId)
        return profile.values()
    }

    @Suppress("UNCHECKED_CAST")
    suspend fun call(name: String, data: Map<String, Any?>): Map<String, Any?> {
        if (BuildConfig.FIREBASE_SPARK) return SparkGateway(preferences).call(name, data)
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
        preferences.authorizationUserId = requireNotNull(auth.currentUser?.uid)
        preferences.authorizationBackend = preferences.backend
        preferences.allowedSectionIds = (result["sectionIds"] as? List<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet()
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
        require(events.all { it.schoolId == schoolId && it.teacherId == auth.currentUser?.uid && it.deviceId == preferences.deviceId && it.backend == preferences.backend }) { "Attendance belongs to another account or backend." }
        return call("ingestAttendanceBatch", mapOf(
            "schoolId" to schoolId, "deviceId" to preferences.deviceId, "leaseId" to requireNotNull(preferences.leaseId),
            "batchId" to UUID.randomUUID().toString(),
            "events" to events.map { e -> mapOf(
                "eventUuid" to e.eventUuid, "idempotencyKey" to e.idempotencyKey, "studentId" to e.studentId, "cardId" to e.cardId.takeIf { e.source == "NFC" }, "source" to e.source,
                "subjectId" to e.subjectId.takeIf { e.backend == "SPARK" && it.isNotEmpty() }, "attendanceTag" to e.attendanceTag.takeIf { e.backend == "SPARK" && it.isNotEmpty() }, "eventType" to e.eventType, "localSchoolDate" to e.localSchoolDate, "localTimestamp" to e.localTimestamp,
                "timezone" to e.timezone, "clockTrust" to e.clockTrust, "scannerSessionId" to e.scannerSessionId,
                "smsExpectedCount" to e.smsExpectedCount,
            ).filterValues { it != null } },
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
