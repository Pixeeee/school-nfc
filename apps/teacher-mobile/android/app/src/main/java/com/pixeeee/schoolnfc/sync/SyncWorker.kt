
package com.pixeeee.schoolnfc.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.security.CryptoManager

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val database = AppDatabase.get(context)
    private val preferences = DevicePreferences(context)
    private val cloud = CloudGateway(preferences)

    override suspend fun doWork(): Result {
        if (cloud.currentUser() == null || !preferences.leaseValid()) return Result.failure()
        return try {
            uploadAttendance()
            SnapshotSynchronizer(database, cloud, preferences, CryptoManager()).refreshAll()
            uploadSms()
            Result.success()
        } catch (error: Exception) {
            Result.retry()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun uploadAttendance() {
        val events = database.attendance().pendingForScope(50, requireNotNull(preferences.schoolId), requireNotNull(cloud.currentUser()?.uid), preferences.backend)
        if (events.isEmpty()) return
        val response = cloud.ingestAttendance(events)
        val results = response["results"] as? List<Map<String, Any?>> ?: emptyList()
        val now = System.currentTimeMillis()
        for (result in results) {
            val uuid = result["localEventUuid"]?.toString() ?: continue
            val state = result["result"]?.toString() ?: "CONFLICT"
            val localStatus = when (state) { "ACCEPTED", "ALREADY_EXISTS" -> "SYNCED"; else -> "CONFLICT" }
            database.attendance().updateSync(uuid, localStatus, result["eventId"]?.toString(), result["errorMessage"]?.toString())
        }
        val completed = results.filter { it["result"] in listOf("ACCEPTED", "ALREADY_EXISTS", "REJECTED") }.mapNotNull { it["localEventUuid"]?.toString() }
        if (completed.isNotEmpty()) database.syncOutbox().markDone("ATTENDANCE_EVENT", completed, now)
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun uploadSms() {
        val dirty = database.smsOutbox().dirtyForScope(100, requireNotNull(preferences.schoolId), requireNotNull(cloud.currentUser()?.uid), preferences.backend)
        if (dirty.isEmpty()) return
        val response = cloud.ingestSmsResults(dirty)
        val results = response["results"] as? List<Map<String, Any?>> ?: error("SMS sync response is invalid.")
        val accepted = results.filter { it["result"] in listOf("ACCEPTED", "REJECTED") }.mapNotNull { it["messageId"]?.toString() }
        database.smsOutbox().markClean(accepted)
        if (accepted.size != dirty.size) error("Some SMS results were rejected; retained for review and retry.")
    }
}
