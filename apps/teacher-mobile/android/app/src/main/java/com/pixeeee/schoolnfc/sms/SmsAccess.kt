package com.pixeeee.schoolnfc.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

object SmsAccess {
    fun permissionsGranted(context: Context): Boolean = listOf(Manifest.permission.SEND_SMS, Manifest.permission.READ_PHONE_STATE)
        .all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

    fun subscriptions(context: Context): List<SubscriptionInfo> {
        require(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) { "Allow Phone permission to select the SMS SIM." }
        val manager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            ?: error("This device does not support SIM texting.")
        return manager.activeSubscriptionInfoList.orEmpty()
    }

    fun requireActiveSim(context: Context, id: Int) {
        require(permissionsGranted(context)) { "Allow both SMS and Phone permissions before sending parent texts." }
        require(subscriptions(context).any { it.subscriptionId == id }) { "The selected SIM is no longer active. Select an active SIM in the app's Settings." }
    }
}
