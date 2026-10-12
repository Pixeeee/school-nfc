package com.pixeeee.schoolnfc.attendance

import org.junit.Assert.*
import org.junit.Test

class TeacherSmsProfileTest {
    @Test fun includesSenderAndSchoolWithoutRepeatingSchool() {
        val profile = TeacherSmsProfile.validated(" sir_jade ", " Nara School ")
        for (status in listOf("present on time", "present late", "absent", "dismissed")) {
            val body = "Nara School: Ada Cruz is $status for Math (09:00–10:30) on October 12, 2026. Recorded at 9:00 AM."
            val message = profile.message(body)
            assertTrue(message.contains("Teacher: sir_jade."))
            assertEquals(1, Regex("Nara School").findAll(message).count())
            assertTrue(message.contains("$status for Math (09:00–10:30)"))
            assertTrue(message.contains("October 12, 2026. Recorded at 9:00 AM."))
        }
        assertEquals("Nara School: Test message. Teacher: sir_jade.", profile.message("Test message."))
    }
    @Test fun rejectsEmptyOversizedAndControlCharacterIdentity() {
        for ((username, school) in listOf("" to "School", "teacher" to " ", "x".repeat(61) to "School", "teacher" to "x".repeat(101), "teacher\nAdmin" to "School", "teacher" to "School\u0000")) {
            assertNotNull(runCatching { TeacherSmsProfile.validated(username, school) }.exceptionOrNull())
        }
    }
}
