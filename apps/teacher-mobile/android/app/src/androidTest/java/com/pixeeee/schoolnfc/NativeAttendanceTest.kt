package com.pixeeee.schoolnfc

import android.content.ContentValues
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.pixeeee.schoolnfc.attendance.AttendanceRepository
import com.pixeeee.schoolnfc.cloud.bridgeResponse
import com.pixeeee.schoolnfc.database.*
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.security.CryptoManager
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class NativeAttendanceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun cloudCollectionsArriveAsJavascriptArraysAndObjects() {
        val response = bridgeResponse(mapOf(
            "sections" to listOf(mapOf("id" to "section_a", "name" to "Sampaguita")),
            "academicYears" to listOf(mapOf("id" to "year_2026", "name" to "2026-2027")),
            "gradeLevels" to emptyList<Map<String, String>>(),
        ))
        val decoded = JSONObject(response.toString())
        assertEquals("Sampaguita", decoded.getJSONArray("sections").getJSONObject(0).getString("name"))
        assertEquals(0, decoded.getJSONArray("gradeLevels").length())
    }

    @Test fun versionOneMigrationPreservesAttendanceAndQueuedMessages() = runBlocking {
        val name = "migration-test.db"
        context.deleteDatabase(name)
        val schema = JSONObject(InstrumentationRegistry.getInstrumentation().context.assets.open("com.pixeeee.schoolnfc.database.AppDatabase/2.json").bufferedReader().readText()).getJSONObject("database")
        val old = context.openOrCreateDatabase(name, 0, null)
        val tables = schema.getJSONArray("entities")
        for (index in 0 until tables.length()) {
            val table = tables.getJSONObject(index)
            val tableName = table.getString("tableName")
            if (tableName == "sections") continue
            val sql = table.getString("createSql").replace("\${TABLE_NAME}", tableName).replace(", `source` TEXT NOT NULL DEFAULT 'NFC'", "")
            old.execSQL(sql)
            val indices = table.optJSONArray("indices") ?: org.json.JSONArray()
            for (i in 0 until indices.length()) old.execSQL(indices.getJSONObject(i).getString("createSql").replace("\${TABLE_NAME}", tableName))
            if (tableName == "attendance_events" || tableName == "sms_outbox") {
                val values = ContentValues()
                val fields = table.getJSONArray("fields")
                for (i in 0 until fields.length()) {
                    val field = fields.getJSONObject(i)
                    val column = field.getString("columnName")
                    if (column == "source") continue
                    if (field.getString("affinity") == "INTEGER") values.put(column, 1) else values.put(column, "preserved")
                }
                old.insertOrThrow(tableName, null, values)
            }
        }
        old.version = 1
        old.close()
        val upgraded = Room.databaseBuilder(context, AppDatabase::class.java, name).addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3).build()
        try {
            assertEquals("NFC", upgraded.attendance().byUuid("preserved")!!.source)
            assertNotNull(upgraded.smsOutbox().byMessageId("preserved"))
            assertEquals("FUNCTIONS", upgraded.attendance().byUuid("preserved")!!.backend)
            assertEquals("", upgraded.smsOutbox().byMessageId("preserved")!!.ownerUid)
            assertTrue(upgraded.sections().all().isEmpty())
        } finally { upgraded.close(); context.deleteDatabase(name) }
    }

    @Test fun concurrentPresentTapsPersistOneAttendanceAndOneParentSms() = runBlocking {
        if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context, FirebaseOptions.Builder().setApplicationId("test-school-app").setApiKey("test-key").setProjectId("demo-school-nfc").build())
        val auth = FirebaseAuth.getInstance()
        auth.useEmulator("10.0.2.2", 9099)
        FirebaseFunctions.getInstance("asia-southeast1").useEmulator("10.0.2.2", 5001)
        runCatching { com.google.firebase.firestore.FirebaseFirestore.getInstance().useEmulator("10.0.2.2", 8080) }
        auth.signInAnonymously().await()
        val prefs = DevicePreferences(context)
        prefs.authorizationUserId = auth.currentUser!!.uid; prefs.authorizationBackend = prefs.backend
        prefs.schoolId = "test_school"; prefs.deviceStatus = "APPROVED"; prefs.leaseId = "test_lease"
        prefs.leaseExpiresAt = Instant.now().plusSeconds(3600).toString(); prefs.allowedSectionIds = setOf("section_a")
        prefs.snapshotOwner = "${prefs.backend}|${prefs.schoolId}|${prefs.authorizationUserId}"
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            database.students().upsert(listOf(StudentEntity("student_a", "001", "Juan Santos", "section_a", "ACTIVE")))
            database.guardianRoutes().upsert(listOf(GuardianRouteEntity("route_a", "student_a", "parent_a", CryptoManager().encrypt("+639171234567"), "VERIFIED", "RECORDED", "ACTIVE", true, false, false, false)))
            val repository = AttendanceRepository(context, database, prefs)
            val outcomes = (1..12).map { async(Dispatchers.Default) { repository.markPresent("test_school", "student_a", "section_a") } }.awaitAll()
            assertEquals(1, outcomes.count { it.status == "ACCEPTED" })
            assertEquals(11, outcomes.count { it.status == "DUPLICATE" })
            assertEquals(1, database.attendance().pendingCount())
            assertEquals(1, database.smsOutbox().pendingCount())
            assertEquals("MANUAL", database.attendance().pending(10).single().source)
            val event = database.attendance().pending(10).single()
            val uid = requireNotNull(auth.currentUser?.uid)
            assertTrue(database.attendance().pendingForScope(10, "test_school", "other_user", prefs.backend).isEmpty())
            assertNull(database.smsOutbox().nextReadyForScope(System.currentTimeMillis(), "test_school", "other_user", prefs.backend))
            assertEquals(uid, database.smsOutbox().dirtyForScope(10, "test_school", uid, prefs.backend).single().ownerUid)
            database.attendance().insert(event.copy(localId = 0, eventUuid = "legacy_event", idempotencyKey = "legacy_key", backend = "FUNCTIONS"))
            assertEquals(1, database.attendance().pendingForScope(10, "test_school", uid, "SPARK").size)
            prefs.snapshotOwner = "FUNCTIONS|test_school|$uid"
            assertFalse(prefs.cachedRosterValid())
            prefs.snapshotOwner = "${prefs.backend}|test_school|$uid"
            prefs.authorizationUserId = "other_user"
            assertFalse(prefs.leaseValid())
            prefs.authorizationUserId = uid
            val now = System.currentTimeMillis()
            database.smsOutbox().insert(SmsOutboxEntity(messageId = "test_message", idempotencyKey = "TEST|test_message", attendanceEventUuid = "not_an_event", guardianId = "TEST", encryptedPhone = "not_used", renderedMessage = "Test", subscriptionId = null, cloudDirty = false, createdAtEpochMs = now, updatedAtEpochMs = now))
            database.smsOutbox().markPartSent("test_message", Instant.now().toString(), now)
            assertFalse(database.smsOutbox().dirty(100).any { it.guardianId == "TEST" })
        } finally { prefs.clearAuthorization(); auth.signOut(); database.close() }
    }
}
