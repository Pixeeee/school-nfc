package com.pixeeee.schoolnfc;

import android.Manifest;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.time.Instant;

// Framework-only runner verifies the exact shrunk APK without shared test-library APIs.
public class ReleaseSmokeInstrumentation extends Instrumentation {
    private WebView webView(View view) {
        if (view instanceof WebView) return (WebView)view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup)view).getChildCount(); i++) {
            WebView found = webView(((ViewGroup)view).getChildAt(i));
            if (found != null) return found;
        }
        return null;
    }
    private String evaluate(WebView web, String script) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript(script, result -> { value.set(result); done.countDown(); }));
        if (!done.await(2, TimeUnit.SECONDS)) throw new AssertionError("JavaScript evaluation timed out");
        return value.get();
    }
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        Activity activity = null;
        try {
            if (getTargetContext().checkSelfPermission(Manifest.permission.VIBRATE) != PackageManager.PERMISSION_GRANTED)
                throw new AssertionError("Missing attendance feedback permission");
            activity = startActivitySync(new Intent().setClassName(getTargetContext(), "com.pixeeee.schoolnfc.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            final Activity target = activity;
            runOnMainSync(() -> {
                try {
                    Object bridge = target.getClass().getMethod("getBridge").invoke(target);
                    Object handle = bridge.getClass().getMethod("getPlugin", String.class).invoke(bridge, "SchoolNfc");
                    Object plugin = handle.getClass().getMethod("getInstance").invoke(handle);
                    Method callback = null;
                    for (Method method : plugin.getClass().getMethods()) if (method.getName().equals("onScan")) callback = method;
                    if (callback == null) throw new AssertionError("Native attendance callback missing");
                    Constructor<?> constructor = callback.getParameterTypes()[0].getDeclaredConstructor(String.class, String.class, String.class, String.class, String.class, String.class, String.class, String.class, int.class, String.class);
                    constructor.setAccessible(true);
                    for (String status : new String[]{"ACCEPTED", "DUPLICATE", "REJECTED"})
                        callback.invoke(plugin, constructor.newInstance(status, Instant.now().toString(), null, null, null, null, null, null, 0, null));
                } catch (Exception error) { throw new RuntimeException(error); }
            });
            waitForIdleSync();
            WebView web = webView(activity.findViewById(android.R.id.content));
            if (web == null) throw new AssertionError("Native WebView missing");
            for (int attempt = 0; attempt < 50 && !"true".equals(evaluate(web, "Boolean(window.Capacitor && window.Capacitor.nativePromise)")); attempt++) Thread.sleep(50);
            evaluate(web, "Promise.all(['getAuthState','getDeviceState','getQueueSummary'].map(m=>window.Capacitor.nativePromise('SchoolNfc',m,{}))).then(r=>document.documentElement.setAttribute('data-release-smoke',r[1].backend==='SPARK'?'PASS':'FAIL')).catch(()=>document.documentElement.setAttribute('data-release-smoke','FAIL'))");
            String bridgeResult = "null";
            for (int attempt = 0; attempt < 50; attempt++) {
                bridgeResult = evaluate(web, "document.documentElement.getAttribute('data-release-smoke')");
                if (!"null".equals(bridgeResult)) break;
                Thread.sleep(50);
            }
            if (!"\"PASS\"".equals(bridgeResult)) throw new AssertionError("Native JavaScript bridge failed: " + bridgeResult);
            if (activity.isFinishing() || activity.isDestroyed()) throw new AssertionError("Attendance callback closed the activity");
            result.putString("stream", "PASS: shrunk release starts, registers native plugin, resolves JavaScript bridge calls, executes all attendance feedback outcomes, and stays open.\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + error.toString() + "\n");
            finish(Activity.RESULT_CANCELED, result);
        } finally {
            if (activity != null) { final Activity target = activity; runOnMainSync(target::finish); }
        }
    }
}
