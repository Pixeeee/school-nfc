package com.pixeeee.schoolnfc

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.device.DevicePreferences
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PortalLoginTest {
    @Test fun schoolIssuedUsernameSignsInToFirebaseAsTeacher() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        val username = args.getString("teacherUsername")
        val password = args.getString("teacherPassword")
        assumeTrue("A disposable teacher account is required for the live login check.", username != null && password != null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = DevicePreferences(context)
        val cloud = CloudGateway(preferences)
        try {
            val result = cloud.signIn(requireNotNull(username), requireNotNull(password))
            assertEquals(true, result["signedIn"])
            assertEquals("schoolattendance", preferences.schoolId)
            val user = requireNotNull(FirebaseAuth.getInstance().currentUser)
            assertEquals("ANDROID", user.getIdToken(true).await().claims["portalClient"])
            val member = FirebaseFirestore.getInstance().document("schools/schoolattendance/members/${user.uid}").get().await()
            assertEquals("TEACHER", member.getString("role"))
            assertEquals("ACTIVE", member.getString("status"))
            val setup = cloud.call("getTeacherSetup", mapOf("schoolId" to "schoolattendance"))
            assertNotNull(setup["academicYears"])
            val sectionId = java.util.UUID.randomUUID().toString()
            cloud.call("createTeacherSection", mapOf("schoolId" to "schoolattendance", "requestId" to sectionId, "name" to "Temporary native no-phone class", "academicYearId" to "current", "gradeLevelId" to "initial"))
            val studentId = java.util.UUID.randomUUID().toString()
            cloud.call("createTeacherStudent", mapOf("schoolId" to "schoolattendance", "requestId" to studentId, "sectionId" to sectionId, "studentNumber" to "VERIFY_${studentId.take(8).uppercase()}", "firstName" to "Synthetic", "lastName" to "Test Student", "parentName" to "Synthetic Test Parent", "parentPhone" to "09171111111", "parentPhoneVerified" to true, "parentConsent" to true))
            assertFalse(FirebaseFirestore.getInstance().document("schools/schoolattendance/sparkDevices/${preferences.deviceId}").get().await().exists())
        } finally {
            cloud.signOut()
        }
    }
}
