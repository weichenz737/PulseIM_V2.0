# Capacitor discovers plugins and JavaScript bridge methods through annotations/reflection.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.annotation.NativePlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.BridgeActivity { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor core classes are heavily used through reflection (permission checks,
# method invocation, annotation lookup). R8 optimization of these classes can
# produce broken bytecode (e.g. Plugin.getPermissionStates() compiled to an
# unconditional NPE), which crashes the app on any permission check. Keep them
# intact.
-keep class com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.Bridge { *; }
-keep class com.getcapacitor.PluginHandle { *; }
-keep class com.getcapacitor.PluginMethodHandle { *; }
-keep class com.getcapacitor.PluginCall { *; }
-keep class com.getcapacitor.JSObject { *; }
-keep class com.getcapacitor.JSArray { *; }
-keep class com.getcapacitor.JSValue { *; }
-keep class com.getcapacitor.PermissionState { *; }
-keep class com.getcapacitor.PermissionManager { *; }

# Preserve runtime annotations and generic signatures used by plugins.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keepattributes Signature,InnerClasses,EnclosingMethod

# Keep enum conversion methods used across native plugin boundaries.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Retain useful line numbers while hiding source file names in release traces.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Suppress optional Google Play service references when those SDKs are absent.
-dontwarn com.google.android.gms.**
