
package com.pixeeee.schoolnfc.workers

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.time.Duration

object QueueScheduler {
    fun scheduleSms(context: Context) {
        val request = OneTimeWorkRequestBuilder<com.pixeeee.schoolnfc.sms.SmsQueueWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(15))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("school-nfc-sms", ExistingWorkPolicy.KEEP, request)
    }

    fun scheduleSync(context: Context) {
        val request = OneTimeWorkRequestBuilder<com.pixeeee.schoolnfc.sync.SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("school-nfc-sync", ExistingWorkPolicy.KEEP, request)
    }
}
