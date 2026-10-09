package com.pixeeee.schoolnfc.attendance

object AttendancePolicy {
    fun key(schoolId: String, studentId: String, localDate: String, eventType: String) = "$schoolId|$studentId|$localDate|$eventType"

    fun manualRejection(status: String, sectionId: String, allowedSections: Set<String>): String? = when {
        status != "ACTIVE" -> "Student is not active."
        sectionId !in allowedSections -> "Section is outside this phone's authorization."
        else -> null
    }
}
