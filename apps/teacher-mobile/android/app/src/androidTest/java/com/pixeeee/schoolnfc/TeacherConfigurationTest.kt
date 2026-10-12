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
class TeacherConfigurationTest {
    @Test fun teachersConfigureTheirSharedClassWithoutAdministratorConfiguration() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Disposable configuration teachers are required", args.containsKey("configurationTeacherA"))
        val prefs = DevicePreferences(InstrumentationRegistry.getInstrumentation().targetContext)
        val cloud = CloudGateway(prefs)
        val sectionId = requireNotNull(args.getString("configurationSection"))
        val subjectId = requireNotNull(args.getString("configurationSubject"))
        val otherUid = requireNotNull(args.getString("configurationTeacherBUid"))
        try {
            cloud.signIn(requireNotNull(args.getString("configurationTeacherA")), requireNotNull(args.getString("configurationPasswordA")))
            val ownUid = requireNotNull(cloud.currentUser()?.uid)
            val context = mapOf("schoolId" to "schoolattendance")
            val directory = cloud.call("activeTeacherDirectory", context)["teachers"] as List<*>
            assertTrue(directory.any { (it as Map<*, *>)["id"] == otherUid })
            assertTrue(directory.all { (it as Map<*, *>).keys.all { key -> key in setOf("id", "name", "username") } })
            cloud.call("createTeacherSection", context + mapOf("requestId" to sectionId, "name" to "Temporary configuration verification", "academicYearId" to "current", "gradeLevelId" to "initial"))
            val subject = context + mapOf("sectionId" to sectionId, "subjectId" to subjectId, "teacherId" to ownUid, "name" to "Math", "startTime" to "09:00", "endTime" to "10:30")
            cloud.call("subjectSet", subject)
            cloud.call("sectionAssign", context + mapOf("sectionId" to sectionId, "adviserId" to otherUid))
            val rejected = runCatching { cloud.call("sectionAssign", context + mapOf("sectionId" to sectionId, "adviserId" to ownUid)) }.exceptionOrNull()
            assertNotNull(rejected)
            assertTrue(rejected!!.message.orEmpty().contains("current section adviser"))
            cloud.signOut()
            cloud.signIn(requireNotNull(args.getString("configurationTeacherB")), requireNotNull(args.getString("configurationPasswordB")))
            cloud.call("subjectSet", subject + mapOf("name" to "Mathematics", "startTime" to "09:30", "endTime" to "11:00"))
            val sections = cloud.call("getTeacherSetup", context)["sections"] as List<*>
            val shared = sections.map { it as Map<*, *> }.first { it["id"] == sectionId }
            assertEquals(otherUid, shared["adviserId"])
            val configured = (shared["subjects"] as List<*>).map { it as Map<*, *> }.first { it["id"] == subjectId }
            assertEquals("Mathematics", configured["name"])
            assertEquals("09:30", configured["startTime"])
            assertEquals("11:00", configured["endTime"])
        } finally { cloud.signOut() }
    }
}
