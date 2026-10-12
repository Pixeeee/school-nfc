package com.pixeeee.schoolnfc.attendance

data class TeacherSmsProfile(val username: String, val schoolName: String) {
    fun message(body: String): String {
        val withSchool = if (body.contains(schoolName)) body else "$schoolName: $body"
        return "$withSchool Teacher: $username."
    }

    companion object {
        fun validated(username: String, schoolName: String): TeacherSmsProfile {
            require(username.none { it.isISOControl() } && schoolName.none { it.isISOControl() }) { "Use single-line teacher and school names." }
            val name = username.trim(); val school = schoolName.trim()
            require(name.length in 1..60 && school.length in 1..100) { "Enter a username (up to 60 characters) and school (up to 100 characters)." }
            return TeacherSmsProfile(name, school)
        }
    }
}
