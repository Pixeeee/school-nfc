package com.pixeeee.schoolnfc

import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp

class MainActivity : BridgeActivity() {
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
