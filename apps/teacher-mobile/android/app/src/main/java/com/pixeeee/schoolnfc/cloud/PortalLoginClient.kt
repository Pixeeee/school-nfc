package com.pixeeee.schoolnfc.cloud

import com.pixeeee.schoolnfc.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object PortalLoginClient {
    fun configure(action: String, fields: Map<String, Any?>, idToken: String): Map<String, Any?> {
        val connection = URL(BuildConfig.PORTAL_URL).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 20_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $idToken")
            connection.outputStream.use { it.write(JSONObject(fields).put("action", action).toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val stream = if (code == 200) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { JSONObject(it.readText()) }
            if (code != 200) error(body?.optString("error")?.takeIf { it.isNotBlank() } ?: "Teacher configuration is unavailable. Try again shortly.")
            return jsonMap(requireNotNull(body))
        } finally { connection.disconnect() }
    }

    private fun jsonMap(value: JSONObject): Map<String, Any?> = value.keys().asSequence().associateWith { key ->
        when (val item = value.get(key)) {
            is JSONObject -> jsonMap(item)
            is org.json.JSONArray -> (0 until item.length()).map { i ->
                val entry = item.get(i)
                if (entry is JSONObject) jsonMap(entry) else entry
            }
            JSONObject.NULL -> null
            else -> item
        }
    }

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
