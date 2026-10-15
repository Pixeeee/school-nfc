package com.pixeeee.schoolnfc

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pixeeee.schoolnfc.attendance.TeacherSmsProfile
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.net.URL
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TeacherSmsProfileCacheTest {
    @Test fun firebaseProfileRoundTripAndOfflineCacheUseTheSignedInTeacher() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val auth = FirebaseAuth.getInstance(); auth.useEmulator("10.0.2.2", 9099)
        val db = FirebaseFirestore.getInstance()
        runCatching { db.useEmulator("10.0.2.2", 8080) }
        assertEquals("10.0.2.2:8080", db.firestoreSettings.host)
        auth.signInAnonymously().await()
        val uid = requireNotNull(auth.currentUser?.uid)
        val school = "profile-native-test"
        val project = FirebaseApp.getInstance().options.projectId
        fun seed(path: String, fields: JSONObject) {
            val connection = URL("http://10.0.2.2:8080/v1/projects/$project/databases/(default)/documents/schools/$school$path").openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "PATCH"; connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer owner")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(JSONObject().put("fields", fields).toString().toByteArray()) }
            assertEquals(200, connection.responseCode); connection.disconnect()
        }
        fun text(value: String) = JSONObject().put("stringValue", value)
        seed("", JSONObject().put("name", text("Default School")))
        seed("/members/$uid", JSONObject().put("status", text("ACTIVE")).put("role", text("TEACHER")).put("username", text("teacher_login")))
        val prefs = DevicePreferences(context); val oldSchool = prefs.schoolId
        prefs.schoolId = school
        try {
            val cloud = CloudGateway(prefs)
            assertEquals("teacher_login", cloud.getTeacherProfile()["username"])
            val custom = "Hello, {{studentName}} is {{attendanceStatus}} on {{eventDate}} at {{eventTime}}."
            val saved = cloud.saveTeacherProfile(" sir_jade ", " Nara School ", custom, "")
            assertEquals("sir_jade", saved["username"])
            assertEquals("Nara School", cloud.getTeacherProfile()["schoolName"])
            val document = db.collection("schools").document(school).collection("teacherSmsProfiles").document(uid).get().await()
            assertEquals(setOf("username", "schoolName", "attendanceTemplate", "dismissalTemplate", "updatedAt"), document.data!!.keys)
            assertEquals(custom, prefs.teacherSmsProfile(uid)!!.attendanceTemplate)
            db.disableNetwork().await()
            assertEquals(saved, cloud.getTeacherProfile())
            assertNotNull(runCatching { cloud.saveTeacherProfile("unsaved_teacher", "Unsaved School") }.exceptionOrNull())
            assertEquals(saved, cloud.getTeacherProfile())
            db.enableNetwork().await()
            assertEquals(saved, cloud.getTeacherProfile())
        } finally { db.enableNetwork().await(); prefs.schoolId = oldSchool; auth.signOut() }
    }

    @Test fun profileSurvivesRestartAndNeverCrossesTeacherOrSchool() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val prefs = DevicePreferences(context); val oldSchool = prefs.schoolId
        try {
            prefs.schoolId = "profile-cache-school-a"
            val profile = TeacherSmsProfile.validated("sir_jade", "Nara School", "{{studentName}}: {{attendanceStatus}} at {{eventTime}} on {{eventDate}}.", "")
            prefs.cacheTeacherSmsProfile("profile-cache-teacher-a", profile)
            assertEquals(profile, DevicePreferences(context).teacherSmsProfile("profile-cache-teacher-a"))
            assertNull(prefs.teacherSmsProfile("profile-cache-teacher-b"))
            prefs.schoolId = "profile-cache-school-b"
            assertNull(prefs.teacherSmsProfile("profile-cache-teacher-a"))
            prefs.schoolId = "profile-cache-school-a"
            assertEquals(profile, prefs.teacherSmsProfile("profile-cache-teacher-a"))
        } finally { prefs.schoolId = oldSchool }
    }
    @Test fun customRosterOrderNeverCrossesAccountSchoolOrClass() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val prefs = DevicePreferences(context); val oldSchool = prefs.schoolId; val oldUser = prefs.authorizationUserId
        try {
            prefs.schoolId = "order-school"; prefs.authorizationUserId = "order-teacher-a"
            prefs.saveRosterOrder("nara", listOf("student_b", "student_a"))
            assertEquals(listOf("student_b", "student_a"), DevicePreferences(context).rosterOrder("nara"))
            assertTrue(prefs.rosterOrder("acacia").isEmpty())
            prefs.authorizationUserId = "order-teacher-b"
            assertTrue(prefs.rosterOrder("nara").isEmpty())
            prefs.authorizationUserId = "order-teacher-a"; prefs.schoolId = "other-school"
            assertTrue(prefs.rosterOrder("nara").isEmpty())
            prefs.schoolId = "order-school"; prefs.saveRosterOrder("nara", emptyList())
            assertTrue(prefs.rosterOrder("nara").isEmpty())
        } finally { prefs.schoolId = oldSchool; prefs.authorizationUserId = oldUser }
    }

}
