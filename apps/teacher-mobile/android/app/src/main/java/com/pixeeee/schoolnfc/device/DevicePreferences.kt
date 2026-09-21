
package com.pixeeee.schoolnfc.device

import android.content.Context
import java.util.UUID

class DevicePreferences(context: Context) {
    private val prefs = context.getSharedPreferences("school_nfc_device", Context.MODE_PRIVATE)
    val deviceId: String get() = prefs.getString("device_id", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("device_id", it).apply() }
    var schoolId: String? get() = prefs.getString("school_id", null); set(v) { prefs.edit().putString("school_id", v).apply() }
    var schoolPublicCode: String? get() = prefs.getString("school_public_code", null); set(v) { prefs.edit().putString("school_public_code", v).apply() }
    var schoolName: String? get() = prefs.getString("school_name", null); set(v) { prefs.edit().putString("school_name", v).apply() }
    var deviceStatus: String get() = prefs.getString("device_status", "UNREGISTERED")!!; set(v) { prefs.edit().putString("device_status", v).apply() }
    var leaseId: String? get() = prefs.getString("lease_id", null); set(v) { prefs.edit().putString("lease_id", v).apply() }
    var leaseExpiresAt: String? get() = prefs.getString("lease_expires_at", null); set(v) { prefs.edit().putString("lease_expires_at", v).apply() }
    var selectedSubscriptionId: Int? get() = if (prefs.contains("subscription_id")) prefs.getInt("subscription_id", -1) else null; set(v) { if (v == null) prefs.edit().remove("subscription_id").apply() else prefs.edit().putInt("subscription_id", v).apply() }
    var snapshotVersion: String? get() = prefs.getString("snapshot_version", null); set(v) { prefs.edit().putString("snapshot_version", v).apply() }
    fun leaseValid(nowMs: Long = System.currentTimeMillis()): Boolean = try { leaseId != null && leaseExpiresAt?.let { java.time.Instant.parse(it).toEpochMilli() > nowMs } == true } catch (_: Exception) { false }
    fun clearAuthorization() { prefs.edit().remove("lease_id").remove("lease_expires_at").putString("device_status", "UNREGISTERED").apply() }
}
