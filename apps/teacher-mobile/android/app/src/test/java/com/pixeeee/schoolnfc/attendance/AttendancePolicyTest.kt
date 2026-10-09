package com.pixeeee.schoolnfc.attendance

import org.junit.Assert.*
import org.junit.Test

class AttendancePolicyTest {
    @Test fun manualAndNfcShareTheSameDailyArrivalKey() {
        assertEquals("school|student|2026-10-09|ARRIVAL", AttendancePolicy.key("school", "student", "2026-10-09", "ARRIVAL"))
        assertNotEquals(AttendancePolicy.key("school", "student", "2026-10-09", "ARRIVAL"), AttendancePolicy.key("school", "student", "2026-10-10", "ARRIVAL"))
    }
    @Test fun manualAttendanceRequiresAnActiveStudentAndAnAuthorizedSection() {
        assertNull(AttendancePolicy.manualRejection("ACTIVE", "section_a", setOf("section_a")))
        assertNotNull(AttendancePolicy.manualRejection("INACTIVE", "section_a", setOf("section_a")))
        assertNotNull(AttendancePolicy.manualRejection("ACTIVE", "section_b", setOf("section_a")))
        assertNotNull(AttendancePolicy.manualRejection("ACTIVE", "section_a", emptySet()))
    }
}
