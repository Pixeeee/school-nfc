package com.pixeeee.schoolnfc

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.security.CryptoManager
import com.pixeeee.schoolnfc.sync.SnapshotSynchronizer
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.net.URL
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class SparkGatewayTest {
    @Test fun realFirestoreGatewayCompletesTeacherWorkflowWithoutFunctions() = runBlocking {
        assertTrue(BuildConfig.FIREBASE_SPARK)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
            .setProjectId("demo-school-nfc").setApplicationId("1:123:android:synthetic")
            .setApiKey("synthetic-emulator-api-key").build())
        val auth = FirebaseAuth.getInstance(); auth.useEmulator("10.0.2.2", 9099)
        runCatching { FirebaseFirestore.getInstance().useEmulator("10.0.2.2", 8080) }
        auth.signInWithEmailAndPassword("spark-teacher@example.test", "Synthetic-test-only-123").await()
        val preferences = DevicePreferences(context); preferences.clearAuthorization()
        val cloud = CloudGateway(preferences)
        val school = "spark_native"
        assertEquals("PENDING", cloud.registerDevice(school, "Emulator teacher phone")["status"])
        try { cloud.renewLease(school); fail("Pending phone must not renew.") } catch (_: IllegalArgumentException) { }
        approveOnlyInEmulator(preferences.deviceId)
        cloud.renewLease(school)
        val base = mapOf("schoolId" to school, "deviceId" to preferences.deviceId, "leaseId" to preferences.leaseId)
        val section = UUID.randomUUID().toString()
        val sectionData = base + mapOf("requestId" to section, "name" to "Sampaguita", "academicYearId" to "current", "gradeLevelId" to "initial")
        assertEquals(section, cloud.call("createTeacherSection", sectionData)["sectionId"])
        assertEquals(section, cloud.call("createTeacherSection", sectionData)["sectionId"])
        cloud.renewLease(school)
        assertTrue(section in preferences.allowedSectionIds)
        val student = UUID.randomUUID().toString()
        val studentData = base + mapOf("requestId" to student, "sectionId" to section, "studentNumber" to "NATIVE-001", "firstName" to "Test", "lastName" to "Student",
            "parentName" to "Test Parent", "parentPhone" to "09171234567", "parentPhoneVerified" to true, "parentConsent" to true)
        assertEquals(student, cloud.call("createTeacherStudent", studentData)["studentId"])
        assertEquals(student, cloud.call("createTeacherStudent", studentData)["studentId"])
        try { cloud.call("createTeacherStudent", studentData + mapOf("requestId" to UUID.randomUUID().toString(), "parentConsent" to false)); fail("Consent is required.") } catch (_: IllegalArgumentException) { }
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            SnapshotSynchronizer(db, cloud, preferences, CryptoManager()).refreshAll()
            assertEquals("Test Student", db.students().byId(student)?.displayName)
            assertEquals(1, db.guardianRoutes().activeForStudent(student).size)
            val eventId = UUID.randomUUID().toString(); val now = Instant.now()
            val date = now.atZone(ZoneId.of("Asia/Manila")).toLocalDate().toString()
            val key = "$school|$student|$date|ARRIVAL"
            val event = mapOf("eventUuid" to eventId, "idempotencyKey" to key, "studentId" to student, "source" to "MANUAL", "eventType" to "ARRIVAL",
                "localSchoolDate" to date, "localTimestamp" to now.toString(), "timezone" to "Asia/Manila", "smsExpectedCount" to 1)
            fun result(response: Map<String, Any?>) = ((response["results"] as List<*>).first() as Map<*, *>)["result"]
            assertEquals("ACCEPTED", result(cloud.call("ingestAttendanceBatch", base + ("events" to listOf(event)))))
            assertEquals("ALREADY_EXISTS", result(cloud.call("ingestAttendanceBatch", base + ("events" to listOf(event)))))
            val duplicate = event + ("eventUuid" to UUID.randomUUID().toString())
            assertEquals("REJECTED", result(cloud.call("ingestAttendanceBatch", base + ("events" to listOf(duplicate)))))
            val orphan = mapOf("messageId" to UUID.randomUUID().toString(), "attendanceEventId" to duplicate["eventUuid"], "guardianId" to "${student}_parent", "status" to "SENT", "attemptCount" to 1,
                "sentAt" to now.toString(), "deliveredAt" to null, "lastErrorCode" to null)
            assertEquals("REJECTED", result(cloud.call("ingestSmsResults", base + ("results" to listOf(orphan)))))
            val sms = mapOf("messageId" to UUID.randomUUID().toString(), "attendanceEventId" to eventId, "guardianId" to "${student}_parent", "status" to "SENT", "attemptCount" to 1,
                "sentAt" to now.toString(), "deliveredAt" to null, "lastErrorCode" to null)
            assertEquals("ACCEPTED", result(cloud.call("ingestSmsResults", base + ("results" to listOf(sms)))))
            assertEquals("ACCEPTED", result(cloud.call("ingestSmsResults", base + ("results" to listOf(sms + ("status" to "DELIVERED") + ("deliveredAt" to now.toString()))))))
        } finally { db.close(); auth.signOut(); preferences.clearAuthorization() }
    }

    private fun approveOnlyInEmulator(deviceId: String) {
        // Emulator admin endpoint is deliberately inaccessible to production code.
        val connection = URL("http://10.0.2.2:8080/v1/projects/demo-school-nfc/databases/(default)/documents:commit").openConnection() as java.net.HttpURLConnection
        connection.requestMethod = "POST"; connection.doOutput = true
        connection.setRequestProperty("Authorization", "Bearer owner")
        connection.setRequestProperty("Content-Type", "application/json")
        val fields = JSONObject().put("status", JSONObject().put("stringValue", "APPROVED"))
            .put("leaseExpiresAt", JSONObject().put("timestampValue", Instant.now().plusSeconds(86400).toString()))
        val update = JSONObject().put("name", "projects/demo-school-nfc/databases/(default)/documents/schools/spark_native/sparkDevices/$deviceId").put("fields", fields)
        val write = JSONObject().put("update", update).put("updateMask", JSONObject().put("fieldPaths", org.json.JSONArray(listOf("status", "leaseExpiresAt"))))
        connection.outputStream.use { it.write(JSONObject().put("writes", org.json.JSONArray(listOf(write))).toString().toByteArray()) }
        assertEquals(200, connection.responseCode); connection.disconnect()
    }
}
