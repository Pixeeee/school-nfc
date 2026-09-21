
package com.pixeeee.schoolnfc.sms

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.security.CryptoManager
import java.util.ArrayList

class SmsQueueWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val database = AppDatabase.get(context)
    private val preferences = DevicePreferences(context)
    private val crypto = CryptoManager()

    override suspend fun doWork(): Result {
        val now = System.currentTimeMillis()
        database.smsOutbox().recoverStaleSending(now, now - 5 * 60_000)
        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) return Result.failure()
        val subscriptionId = preferences.selectedSubscriptionId ?: return Result.retry()
        val item = database.smsOutbox().nextReady(now) ?: return Result.success()
        return try {
            val manager = SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
            val destination = crypto.decrypt(item.encryptedPhone)
            val parts = manager.divideMessage(item.renderedMessage)
            if (database.smsOutbox().claim(item.messageId, parts.size.coerceAtLeast(1), subscriptionId, now) != 1) return Result.success()
            val sentIntents = ArrayList<PendingIntent>()
            val deliveryIntents = ArrayList<PendingIntent>()
            for (index in parts.indices) {
                sentIntents += pendingIntent(SmsSentReceiver.ACTION, item.messageId, index)
                deliveryIntents += pendingIntent(SmsDeliveredReceiver.ACTION, item.messageId, index)
            }
            if (parts.size <= 1) manager.sendTextMessage(destination, null, item.renderedMessage, sentIntents.first(), deliveryIntents.first())
            else manager.sendMultipartTextMessage(destination, null, parts, sentIntents, deliveryIntents)
            Result.success()
        } catch (error: Exception) {
            val attempt = item.attemptCount + 1
            val retryable = attempt < 8
            val delay = (15_000L * (1L shl attempt.coerceAtMost(8))).coerceAtMost(6 * 60 * 60_000L)
            database.smsOutbox().markFailure(item.messageId, if (retryable) "FAILED_RETRYABLE" else "FAILED_FINAL", "SEND_EXCEPTION", error.message ?: "SMS send failed", now + delay, now)
            if (retryable) Result.retry() else Result.success()
        }
    }

    private fun pendingIntent(action: String, messageId: String, partIndex: Int): PendingIntent {
        val receiver = if (action == SmsSentReceiver.ACTION) SmsSentReceiver::class.java else SmsDeliveredReceiver::class.java
        val intent = Intent(applicationContext, receiver).setAction(action).putExtra("messageId", messageId).putExtra("partIndex", partIndex)
        return PendingIntent.getBroadcast(applicationContext, (messageId.hashCode() * 31 + partIndex + action.hashCode()), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
