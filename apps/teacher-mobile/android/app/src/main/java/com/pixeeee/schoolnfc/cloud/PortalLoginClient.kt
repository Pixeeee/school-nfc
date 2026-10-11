package com.pixeeee.schoolnfc.cloud

import com.pixeeee.schoolnfc.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object PortalLoginClient {
    fun signIn(identifier: String, password: String): Pair<String, String> {
        val connection = URL(BuildConfig.PORTAL_URL).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 20_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(JSONObject().put("action", "login").put("client", "ANDROID")
                .put("identifier", identifier.trim().lowercase()).put("password", password).toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            if (code != 200) error(if (code == 401) "Incorrect teacher username or password." else "Teacher sign-in is unavailable. Try again shortly.")
            val body = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
            val token = body.getString("customToken")
            val schoolId = body.getString("schoolId")
            require(token.isNotBlank() && Regex("^[A-Za-z0-9_-]{1,120}$").matches(schoolId)) { "Invalid school sign-in response." }
            return token to schoolId
        } finally {
            connection.disconnect()
        }
    }
}
