
package com.pixeeee.schoolnfc.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.workers.QueueScheduler
import java.time.Instant

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val messageId = intent.getStringExtra("messageId") ?: return pending.finish()
        val result = resultCode
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val dao = AppDatabase.get(context).smsOutbox()
                val now = System.currentTimeMillis()
                if (result == Activity.RESULT_OK) dao.markPartSent(messageId, Instant.ofEpochMilli(now).toString(), now)
                else {
                    val retryable = result in setOf(SmsManager.RESULT_ERROR_NO_SERVICE, SmsManager.RESULT_ERROR_RADIO_OFF, SmsManager.RESULT_ERROR_LIMIT_EXCEEDED, SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED, SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED)
                    val item = dao.byMessageId(messageId)
                    val attempt = item?.attemptCount ?: 1
                    val finalRetryable = retryable && attempt < 8
                    val delay = (30_000L * (1L shl attempt.coerceAtMost(8))).coerceAtMost(6 * 60 * 60_000L)
                    dao.markFailure(messageId, if (finalRetryable) "FAILED_RETRYABLE" else "FAILED_FINAL", "ANDROID_SMS_$result", "Android SMS result code $result", now + delay, now)
                }
                QueueScheduler.scheduleSms(context)
                QueueScheduler.scheduleSync(context)
            } finally { pending.finish() }
        }
    }
    companion object { const val ACTION = "com.pixeeee.schoolnfc.SMS_SENT" }
}
