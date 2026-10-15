package com.pixeeee.schoolnfc.attendance

data class TeacherSmsProfile(val username: String, val schoolName: String, val attendanceTemplate: String = "", val dismissalTemplate: String = "") {
    fun message(body: String): String {
        val withSchool = if (body.contains(schoolName)) body else "$schoolName: $body"
        return "$withSchool Teacher: $username."
    }
    fun values(): Map<String, String> = mapOf("username" to username, "schoolName" to schoolName, "attendanceTemplate" to attendanceTemplate, "dismissalTemplate" to dismissalTemplate)
    companion object {
        private val tokens = setOf("studentName", "studentCode", "sectionName", "attendanceStatus", "eventDate", "eventTime")
        fun validated(username: String, schoolName: String, attendanceTemplate: String = "", dismissalTemplate: String = ""): TeacherSmsProfile {
            require(username.none { it.isISOControl() } && schoolName.none { it.isISOControl() }) { "Use single-line teacher and school names." }
            val name = username.trim(); val school = schoolName.trim()
            require(name.length in 1..60 && school.length in 1..100) { "Enter a username (up to 60 characters) and school (up to 100 characters)." }
            for (template in listOf(attendanceTemplate, dismissalTemplate)) {
                require(template.length <= 600 && template.none { it.isISOControl() && it != '\n' }) { "Messages must be at most 600 characters." }
                if (template.isBlank()) continue
                val found = Regex("\\{\\{\\s*(\\w+)\\s*\\}\\}").findAll(template).map { it.groupValues[1] }.toSet()
                require(found.all { it in tokens } && found.containsAll(setOf("studentName", "attendanceStatus", "eventDate", "eventTime"))) { "Include studentName, attendanceStatus, eventDate and eventTime placeholders. Use only the listed placeholders." }
                require(!Regex("\\{\\{\\s*(\\w+)\\s*\\}\\}").replace(template, "").contains(Regex("[{}]"))) { "A message placeholder is incomplete." }
            }
            return TeacherSmsProfile(name, school, attendanceTemplate.trim(), dismissalTemplate.trim())
        }
        fun render(template: String, values: Map<String, String>): String = Regex("\\{\\{\\s*(\\w+)\\s*\\}\\}").replace(template) { values[it.groupValues[1]] ?: it.value }.trim()
    }
}
