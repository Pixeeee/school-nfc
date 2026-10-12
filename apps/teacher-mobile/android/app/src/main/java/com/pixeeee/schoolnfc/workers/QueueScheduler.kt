
package com.pixeeee.schoolnfc.workers

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.time.Duration

object QueueScheduler {
    fun scheduleSms(context: Context) {
        val request = OneTimeWorkRequestBuilder<com.pixeeee.schoolnfc.sms.SmsQueueWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(15))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("school-nfc-sms", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    fun scheduleSync(context: Context, refreshRoster: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<com.pixeeee.schoolnfc.sync.SyncWorker>()
            .setInputData(workDataOf("refreshRoster" to refreshRoster))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("school-nfc-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
}
