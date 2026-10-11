package com.climbingtracker.appupdater;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Self-update for the sideloaded app (see src/lib/update/).
 *
 * - `download({url, sha256})`: fetches the APK into the app's cache, emitting
 *   `progress` events ({fraction}), and rejects - deleting the file - unless
 *   its SHA-256 matches the one published next to it. Only https URLs.
 * - `install()`: opens the system installer on the downloaded APK. When the
 *   user hasn't yet allowed this app to install updates, opens that setting
 *   instead and resolves `{status: "needs-permission"}`.
 *
 * Android itself refuses an APK signed with a different key than the
 * installed app, so a tampered download can't replace the app either way.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String FILE_NAME = "update.apk";

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String expected = call.getString("sha256");
        if (url == null || !url.startsWith("https://") || expected == null) {
            call.reject("An https url and its sha256 are required");
            return;
        }
        new Thread(() -> {
            File out = apkFile();
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                int code = connection.getResponseCode();
                if (code != 200) throw new Exception("HTTP " + code);
                long total = connection.getContentLengthLong();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream in = connection.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    long lastEmit = 0;
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        fos.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        done += read;
                        long now = System.currentTimeMillis();
                        if (total > 0 && now - lastEmit > 150) {
                            lastEmit = now;
                            JSObject progress = new JSObject();
                            progress.put("fraction", (double) done / total);
                            notifyListeners("progress", progress);
                        }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format("%02x", b));
                if (!hex.toString().equalsIgnoreCase(expected)) {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    call.reject("The download doesn't match the published checksum");
                    return;
                }
                JSObject result = new JSObject();
                result.put("bytes", out.length());
                call.resolve(result);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                call.reject("Download failed: " + e.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = apkFile();
        if (!apk.exists()) {
            call.reject("Nothing downloaded");
            return;
        }
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            result.put("status", "needs-permission");
            call.resolve(result);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        result.put("status", "started");
        call.resolve(result);
    }
}
