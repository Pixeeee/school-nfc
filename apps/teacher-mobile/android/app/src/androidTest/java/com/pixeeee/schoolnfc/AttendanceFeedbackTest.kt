package com.pixeeee.schoolnfc

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pixeeee.schoolnfc.attendance.ScanOutcome
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AttendanceFeedbackTest {
    @Test fun attendanceFeedbackKeepsTheActivityOpen() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        assertEquals("Attendance feedback requires the normal VIBRATE permission", PackageManager.PERMISSION_GRANTED,
            ContextCompat.checkSelfPermission(context, Manifest.permission.VIBRATE))
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        try {
            instrumentation.runOnMainSync {
                val plugin = activity.bridge.getPlugin("SchoolNfc").instance as SchoolNfcPlugin
                // Exercise the exact callback invoked after Present; no SMS is queued here.
                for (status in listOf("ACCEPTED", "DUPLICATE", "REJECTED")) plugin.onScan(ScanOutcome(status = status, localTimestamp = java.time.Instant.now().toString()))
            }
            instrumentation.waitForIdleSync()
            assertFalse(activity.isFinishing)
            assertFalse(activity.isDestroyed)
        } finally { instrumentation.runOnMainSync { activity.finish() } }
    }
}
