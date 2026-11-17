# Called from Rust through JNA and JNI
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class uniffi.** { *; }
-keep class org.wizardchat.core.CoreInit { *; }
-keep class org.wizardchat.core.DenoiseLib { *; }
-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }
