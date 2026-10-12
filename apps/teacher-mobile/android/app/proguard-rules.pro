# Capacitor invokes plugin methods from JavaScript by annotation/reflection.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclasseswithmembers class * { @com.getcapacitor.PluginMethod <methods>; }
-keepattributes *Annotation*
# Preserve the small bridge inspection surface used by the release smoke test.
-keep class com.getcapacitor.BridgeActivity { public com.getcapacitor.Bridge getBridge(); }
-keepclassmembers class com.getcapacitor.Bridge { public com.getcapacitor.PluginHandle getPlugin(java.lang.String); }
-keepclassmembers class com.getcapacitor.PluginHandle { public com.getcapacitor.Plugin getInstance(); }
-keepclassmembers class com.pixeeee.schoolnfc.attendance.ScanOutcome { public <init>(java.lang.String,java.lang.String,java.lang.String,java.lang.String,java.lang.String,java.lang.String,java.lang.String,java.lang.String,int,java.lang.String); }
