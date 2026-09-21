
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
            uploadSms()
            SnapshotSynchronizer(database, cloud, preferences, CryptoManager()).refreshAll()
            Result.success()
        } catch (error: Exception) {
            Result.retry()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun uploadAttendance() {
        val events = database.attendance().pending(50)
        if (events.isEmpty()) return
        val response = cloud.ingestAttendance(events)
        val results = response["results"] as? List<Map<String, Any?>> ?: emptyList()
        val now = System.currentTimeMillis()
        for (result in results) {
            val uuid = result["localEventUuid"]?.toString() ?: continue
            val state = result["result"]?.toString() ?: "CONFLICT"
            val localStatus = when (state) { "ACCEPTED", "ALREADY_EXISTS" -> "SYNCED"; else -> "CONFLICT" }
            database.attendance().updateSync(uuid, localStatus, result["serverEventId"]?.toString(), result["conflictReason"]?.toString())
        }
        val completed = results.filter { it["result"] == "ACCEPTED" || it["result"] == "ALREADY_EXISTS" }.mapNotNull { it["localEventUuid"]?.toString() }
        if (completed.isNotEmpty()) database.syncOutbox().markDone("ATTENDANCE_EVENT", completed, now)
    }

    private suspend fun uploadSms() {
        val dirty = database.smsOutbox().dirty(100)
        if (dirty.isEmpty()) return
        cloud.ingestSmsResults(dirty)
        database.smsOutbox().markClean(dirty.map { it.messageId })
    }
}
