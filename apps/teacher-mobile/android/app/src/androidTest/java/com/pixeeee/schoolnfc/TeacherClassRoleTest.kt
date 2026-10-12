package com.pixeeee.schoolnfc

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.device.DevicePreferences
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TeacherClassRoleTest {
    @Test fun createsRoleClassesAndStableAutomaticCodesWithoutSendingSms() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Disposable role teacher and cleanup IDs required", args.containsKey("roleTeacher"))
        val cloud = CloudGateway(DevicePreferences(InstrumentationRegistry.getInstrumentation().targetContext))
        val advisoryId = requireNotNull(args.getString("roleAdvisoryId"))
        val subjectId = requireNotNull(args.getString("roleSubjectId"))
        val studentId = requireNotNull(args.getString("roleStudentId"))
        val secondStudentId = requireNotNull(args.getString("roleSecondStudentId"))
        val context = mapOf("schoolId" to (args.getString("roleSchoolId") ?: "schoolattendance"))
        try {
            cloud.signIn(requireNotNull(args.getString("roleTeacher")), requireNotNull(args.getString("rolePassword")))
            val owner = requireNotNull(cloud.currentUser()?.uid)
            cloud.call("createTeacherSection", context + mapOf("requestId" to advisoryId, "name" to (args.getString("roleAdvisoryName") ?: "Temporary role advisory"), "classKind" to "ADVISORY", "grade" to 1))
            cloud.call("createTeacherSection", context + mapOf("requestId" to subjectId, "name" to (args.getString("roleSubjectName") ?: "Temporary role subject"), "classKind" to "SUBJECT", "grade" to 10, "subjectName" to "Math", "startTime" to "09:00", "endTime" to "10:30"))
            val sections = (cloud.call("getTeacherSetup", context)["sections"] as List<*>).map { it as Map<*, *> }
            val advisory = sections.first { it["id"] == advisoryId }
            assertEquals("ADVISORY", advisory["classKind"])
            assertEquals(1, (advisory["grade"] as Number).toInt())
            assertEquals(owner, advisory["adviserId"])
            val subject = sections.first { it["id"] == subjectId }
            assertEquals("SUBJECT", subject["classKind"])
            assertEquals(10, (subject["grade"] as Number).toInt())
            assertEquals("", subject["adviserId"])
            assertEquals(true, subject["canManageRoster"])
            assertEquals(owner, subject["teacherId"])
            val math = (subject["subjects"] as List<*>).first() as Map<*, *>
            assertEquals("Math", math["name"])
            assertEquals("09:00", math["startTime"])
            assertEquals("10:30", math["endTime"])
            val student = context + mapOf("requestId" to studentId, "sectionId" to subjectId, "firstName" to "Test", "lastName" to "Only", "parentName" to "Test Parent", "parentPhone" to "09171234567", "parentPhoneVerified" to true, "parentConsent" to true)
            val created = cloud.call("createTeacherStudent", student)
            val code = created["studentNumber"].toString()
            assertTrue(code.startsWith("G10-"))
            assertEquals(code, cloud.call("createTeacherStudent", student)["studentNumber"])
            assertNotEquals(code, cloud.call("createTeacherStudent", student + mapOf("requestId" to secondStudentId))["studentNumber"])
            assertNotNull(runCatching { cloud.call("dismissalPreview", context + mapOf("sectionId" to subjectId)) }.exceptionOrNull())
        } finally { cloud.signOut() }
    }
}
