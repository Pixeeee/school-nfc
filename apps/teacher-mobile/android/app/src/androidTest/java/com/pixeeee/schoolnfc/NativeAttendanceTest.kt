package com.pixeeee.schoolnfc

import android.content.ContentValues
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
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
        val upgraded = Room.databaseBuilder(context, AppDatabase::class.java, name).addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3, AppDatabase.MIGRATION_3_4).build()
        try {
            assertEquals("NFC", upgraded.attendance().byUuid("preserved")!!.source)
            assertNotNull(upgraded.smsOutbox().byMessageId("preserved"))
            assertEquals("", upgraded.attendance().byUuid("preserved")!!.subjectId)
            assertEquals("", upgraded.attendance().byUuid("preserved")!!.attendanceTag)
            assertEquals("FUNCTIONS", upgraded.attendance().byUuid("preserved")!!.backend)
            assertEquals("", upgraded.smsOutbox().byMessageId("preserved")!!.ownerUid)
            assertTrue(upgraded.sections().all().isEmpty())
        } finally { upgraded.close(); context.deleteDatabase(name) }
    }

    @Test fun concurrentPresentTapsPersistOneAttendanceAndOneParentSms() = runBlocking {
        if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context, FirebaseOptions.Builder().setApplicationId("test-school-app").setApiKey("test-key").setProjectId("demo-school-nfc").build())
        val auth = FirebaseAuth.getInstance()
        auth.useEmulator("10.0.2.2", 9099)
        runCatching { com.google.firebase.firestore.FirebaseFirestore.getInstance().useEmulator("10.0.2.2", 8080) }
        auth.signInAnonymously().await()
        val prefs = DevicePreferences(context)
        prefs.authorizationUserId = auth.currentUser!!.uid; prefs.authorizationBackend = prefs.backend
        prefs.schoolId = "test_school"; prefs.deviceStatus = "APPROVED"; prefs.leaseId = "test_lease"
        prefs.leaseExpiresAt = Instant.now().plusSeconds(3600).toString(); prefs.allowedSectionIds = setOf("section_a")
        prefs.snapshotOwner = "${prefs.backend}|${prefs.schoolId}|${prefs.authorizationUserId}"
        prefs.cacheTeacherSmsProfile(auth.currentUser!!.uid, com.pixeeee.schoolnfc.attendance.TeacherSmsProfile.validated("sir_jade", "Nara \$School"))
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            database.sections().upsert(listOf(SectionEntity("section_a", "A", auth.currentUser!!.uid)))
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
            val late = repository.markPresent("test_school", "student_a", "section_a", "LATE")
            assertEquals("ACCEPTED", late.status)
            assertEquals("LATE", database.attendance().byUuid(requireNotNull(late.eventUuid))!!.attendanceTag)
            assertEquals("DUPLICATE", repository.markPresent("test_school", "student_a", "section_a", "LATE").status)
            assertEquals(2, database.smsOutbox().dirtyForScope(20, "test_school", uid, prefs.backend).size)
            assertNotNull(runCatching { repository.markPresent("test_school", "student_a", "section_a", "INVALID") }.exceptionOrNull())
            val absent = repository.markAbsent("test_school", "student_a", "section_a")
            assertEquals("ACCEPTED", absent.status)
            assertEquals(1, absent.smsQueued)
            assertEquals("ABSENT", database.attendance().byUuid(requireNotNull(absent.eventUuid))?.status)
            assertEquals("DUPLICATE", repository.markAbsent("test_school", "student_a", "section_a").status)
            val messages = database.smsOutbox().dirtyForScope(20, "test_school", uid, prefs.backend)
            assertTrue(messages.all { it.renderedMessage.contains("Nara \$School") && it.renderedMessage.endsWith("Teacher: sir_jade.") })
            assertTrue(messages.any { it.renderedMessage.contains("is absent") && CryptoManager().decrypt(it.encryptedPhone) == "+639171234567" })
            assertEquals("ACCEPTED", repository.markPresent("test_school", "student_a", "section_a").status)
            assertEquals(4, database.smsOutbox().dirtyForScope(20, "test_school", uid, prefs.backend).size)
            database.sections().upsert(listOf(SectionEntity("section_a", "A", uid, org.json.JSONArray(listOf(
                mapOf("id" to "math", "teacherId" to uid, "name" to "Math", "startTime" to "08:00", "endTime" to "09:00"),
                mapOf("id" to "science", "teacherId" to uid, "name" to "Science", "startTime" to "09:00", "endTime" to "10:00")
            )).toString())))
            assertEquals("ACCEPTED", repository.markSubject("test_school", "student_a", "section_a", "math", "ON_TIME").status)
            assertEquals("ACCEPTED", repository.markSubject("test_school", "student_a", "section_a", "science", "ABSENT").status)
            assertEquals("DUPLICATE", repository.markSubject("test_school", "student_a", "section_a", "math", "ON_TIME").status)
            assertEquals("ACCEPTED", repository.markSubject("test_school", "student_a", "section_a", "math", "LATE").status)
            val date = java.time.LocalDate.now(java.time.ZoneId.of(prefs.schoolTimeZone)).toString()
            assertEquals("LATE", database.attendance().latestSubject("test_school", "student_a", date, "math")!!.attendanceTag)
            assertEquals("ABSENT", database.attendance().latestSubject("test_school", "student_a", date, "science")!!.attendanceTag)
            assertTrue(database.smsOutbox().dirtyForScope(100, "test_school", uid, prefs.backend).any { it.renderedMessage.contains("Math (08:00–09:00)") && it.renderedMessage.contains("present late") })
            val dismissalTime = Instant.now().toString()
            assertEquals(1, repository.dismissSection("test_school", "section_a", dismissalTime, listOf("student_a")))
            // A fresh repository simulates restart after claiming/queueing. Out never queues another text.
            assertEquals(0, AttendanceRepository(context, database, prefs).dismissSection("test_school", "section_a", dismissalTime, listOf("student_a")))
            assertEquals(1, database.attendance().pending(100).count { it.eventType == "DISMISSAL" })
            assertTrue(database.smsOutbox().dirtyForScope(100, "test_school", uid, prefs.backend).any { it.renderedMessage.contains("section dismissed") })
            val now = System.currentTimeMillis()
            database.smsOutbox().insert(SmsOutboxEntity(messageId = "test_message", idempotencyKey = "TEST|test_message", attendanceEventUuid = "not_an_event", guardianId = "TEST", encryptedPhone = "not_used", renderedMessage = "Test", subscriptionId = null, cloudDirty = false, createdAtEpochMs = now, updatedAtEpochMs = now))
            database.smsOutbox().markPartSent("test_message", Instant.now().toString(), now)
            assertFalse(database.smsOutbox().dirty(100).any { it.guardianId == "TEST" })
        } finally { prefs.clearAuthorization(); auth.signOut(); database.close() }
    }
}
