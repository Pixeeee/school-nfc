package com.pixeeee.schoolnfc

import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp
import com.pixeeee.schoolnfc.sms.SmsAccess

class MainActivity : BridgeActivity() {
    private var smsPermissionResult: ((Boolean, Boolean) -> Unit)? = null
    fun requestSmsPermissions(result: (Boolean, Boolean) -> Unit) {
        check(smsPermissionResult == null) { "A permission request is already open." }
        smsPermissionResult = result
        try { requestPermissions(arrayOf(Manifest.permission.SEND_SMS, Manifest.permission.READ_PHONE_STATE), 4317) }
        catch (error: Exception) { smsPermissionResult = null; throw error }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode != 4317) { super.onRequestPermissionsResult(requestCode, permissions, grantResults); return }
        val result = smsPermissionResult
        smsPermissionResult = null
        val granted = SmsAccess.permissionsGranted(this)
        val blocked = !granted && grantResults.isNotEmpty() && permissions.isNotEmpty() && permissions
            .any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED && !shouldShowRequestPermissionRationale(it) }
        result?.invoke(granted, blocked)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val configured = FirebaseApp.getApps(this).isNotEmpty()
        if (configured) registerPlugin(SchoolNfcPlugin::class.java)
        super.onCreate(savedInstanceState)
        if (!configured) {
            val layout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(48, 48, 48, 48)
                setBackgroundColor(Color.rgb(16, 43, 36))
            }
            layout.addView(TextView(this).apply {
                text = "School connection required"
                textSize = 26f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
            })
            layout.addView(TextView(this).apply {
                text = "Ask your school administrator to connect this app before signing in."
                textSize = 16f
                setTextColor(Color.rgb(191, 215, 204))
                gravity = Gravity.CENTER
                setPadding(0, 24, 0, 0)
            })
            setContentView(layout)
        }
    }
}
