package com.pixeeee.schoolnfc

import android.Manifest
import android.app.Activity
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.content.pm.PackageManager
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pixeeee.schoolnfc.sms.SmsAccess
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// The runner script sets permission flags before instrumentation; these tests never send SMS.
@RunWith(AndroidJUnit4::class)
class SmsPermissionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun webView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) webView(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun evaluate(web: WebView, script: String): String {
        val done = CountDownLatch(1); var result = "null"
        instrumentation.runOnMainSync { web.evaluateJavascript(script) { result = it; done.countDown() } }
        assertTrue("JavaScript callback timed out", done.await(3, TimeUnit.SECONDS))
        return result
    }
    private fun withApp(test: (Activity, WebView) -> Unit) {
        val activity = instrumentation.startActivitySync(Intent().setClassName(instrumentation.targetContext, "com.pixeeee.schoolnfc.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        try {
            val web = requireNotNull(webView(activity.findViewById(android.R.id.content)))
            repeat(100) {
                if (evaluate(web, "Boolean(window.Capacitor && window.Capacitor.nativePromise)") == "true") { test(activity, web); return }
                Thread.sleep(50)
            }
            fail("Native bridge did not start")
        } finally { instrumentation.runOnMainSync { activity.finish() } }
    }
    private fun call(web: WebView, method: String) {
        evaluate(web, "window.smsTestResult=null; window.Capacitor.nativePromise('SchoolNfc','$method',{}).then(r=>window.smsTestResult=JSON.stringify(r)).catch(e=>window.smsTestResult=JSON.stringify({error:e.message}))")
    }
    private fun result(web: WebView): JSONObject? {
        val value = JSONTokener(evaluate(web, "window.smsTestResult")).nextValue()
        return if (value is String) JSONObject(value) else null
    }
    private fun awaitResult(web: WebView): JSONObject {
        repeat(100) { result(web)?.let { return it }; Thread.sleep(50) }
        throw AssertionError("Native permission call never resolved")
    }
    @Test fun normalRequestShowsAndroidDialogsAndGrantsBothPermissions() = withApp { activity, web ->
        instrumentation.uiAutomation.serviceInfo = instrumentation.uiAutomation.serviceInfo.apply { flags = flags or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS }
        call(web, "requestSmsPermission")
        var prompts = 0
        repeat(200) {
            if (result(web) == null) {
                val root = instrumentation.uiAutomation.rootInActiveWindow
                val allow = listOf("com.google.android.permissioncontroller", "com.android.permissioncontroller").flatMap { pkg ->
                    root?.findAccessibilityNodeInfosByViewId("$pkg:id/permission_allow_button").orEmpty()
                }.firstOrNull()
                if (allow?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) prompts++
                Thread.sleep(50)
            }
        }
        assertTrue("No Android permission pop-up appeared", prompts > 0)
        assertTrue(awaitResult(web).getBoolean("granted"))
        for (permission in listOf(Manifest.permission.SEND_SMS, Manifest.permission.READ_PHONE_STATE))
            assertEquals(PackageManager.PERMISSION_GRANTED, instrumentation.targetContext.checkSelfPermission(permission))
        assertFalse(activity.isFinishing)
        assertFalse(activity.isDestroyed)
    }
    @Test fun smsGrantedButPhoneDeniedIsNotReady() = withApp { _, web ->
        assertEquals(PackageManager.PERMISSION_GRANTED, instrumentation.targetContext.checkSelfPermission(Manifest.permission.SEND_SMS))
        assertEquals(PackageManager.PERMISSION_DENIED, instrumentation.targetContext.checkSelfPermission(Manifest.permission.READ_PHONE_STATE))
        call(web, "getDeviceState")
        assertFalse("SIM setup needs both SMS and Phone permission", awaitResult(web).getBoolean("smsPermission"))
    }
    @Test fun blockedRequestResolvesWithRecoveryInsteadOfHanging() = withApp { activity, web ->
        call(web, "requestSmsPermission")
        val answer = awaitResult(web)
        assertFalse(answer.getBoolean("granted"))
        assertTrue("Android-blocked permission must be reported", answer.optBoolean("blocked"))
        assertFalse(activity.isFinishing)
    }
    @Test fun inactiveSimIsRejectedBeforeSending() {
        assertTrue(SmsAccess.permissionsGranted(instrumentation.targetContext))
        val error = runCatching { SmsAccess.requireActiveSim(instrumentation.targetContext, Int.MAX_VALUE) }.exceptionOrNull()
        assertNotNull(error)
        assertTrue(error!!.message!!.contains("no longer active"))
    }
}
