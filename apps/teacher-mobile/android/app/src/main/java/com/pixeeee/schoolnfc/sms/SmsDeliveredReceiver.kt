
package com.pixeeee.schoolnfc.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.workers.QueueScheduler
import java.time.Instant

class SmsDeliveredReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val messageId = intent.getStringExtra("messageId") ?: return pending.finish()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (resultCode == Activity.RESULT_OK) {
                    val now = System.currentTimeMillis()
                    AppDatabase.get(context).smsOutbox().markPartDelivered(messageId, Instant.ofEpochMilli(now).toString(), now)
                    QueueScheduler.scheduleSync(context)
                }
            } finally { pending.finish() }
        }
    }
    companion object { const val ACTION = "com.pixeeee.schoolnfc.SMS_DELIVERED" }
}
