package com.climbingtracker.drivesync;

import android.accounts.Account;
import android.app.Activity;
import android.os.Build;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.api.Scope;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Google Drive's app folder (appDataFolder), for syncing the app's data
 * between a user's own devices - no server of ours involved.
 *
 * - `authorize({interactive})`: an access token for drive.appdata (a
 *   hidden per-app folder in the user's Drive; the app can't see any other
 *   file). Play services keeps and refreshes the grant, so after the first
 *   consent this returns silently. Non-interactive calls reject with
 *   code "consent-required" instead of showing a screen.
 * - `list` / `read` / `write`: the folder's files. Content is gzipped on the
 *   way up and unzipped on the way down - a database is mostly repetitive
 *   JSON, so this is ~10x less data on mobile.
 * - `clearToken`: drops a token Drive rejected, so the next authorize gets a fresh one.
 * - `revoke`: disconnect - removes the app's access to the account.
 *
 * HTTP errors reject with code "unauthorized" (401) or "http-<status>".
 */
@CapacitorPlugin(name = "DriveSync")
public class DriveSyncPlugin extends Plugin {
    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";
    private static final String FILES = "https://www.googleapis.com/drive/v3/files";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
    private static final List<Scope> SCOPES = Arrays.asList(new Scope(DRIVE_APPDATA), new Scope("email"));

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingConsent;

    @Override
    public void load() {
        // Registered while the activity is being created, as Android requires.
        consentLauncher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = pendingConsent;
            pendingConsent = null;
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK) {
                call.reject("Sign-in was cancelled", "cancelled");
                return;
            }
            try {
                resolveToken(call, Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(result.getData()));
            } catch (Exception e) {
                call.reject(e.getMessage(), "failed");
            }
        });
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(SCOPES).build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                } else if (!interactive || result.getPendingIntent() == null) {
                    call.reject("Needs signing in to Google", "consent-required");
                } else {
                    pendingConsent = call;
                    consentLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
                }
            })
            .addOnFailureListener(e -> call.reject(e.getMessage(), "failed"));
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("Google didn't return an access token", "failed");
            return;
        }
        JSObject out = new JSObject();
        out.put("token", token);
        GoogleSignInAccount account = result.toGoogleSignInAccount();
        if (account != null && account.getEmail() != null) out.put("email", account.getEmail());
        call.resolve(out);
    }

    @PluginMethod
    public void list(PluginCall call) {
        String token = call.getString("token");
        io.execute(() -> {
            try {
                String url = FILES + "?spaces=appDataFolder&pageSize=1000&fields=files(id,name,modifiedTime)";
                JSONObject body = new JSONObject(new String(request("GET", url, token, null, null), StandardCharsets.UTF_8));
                JSONArray files = body.optJSONArray("files");
                JSArray out = new JSArray();
                if (files != null) for (int i = 0; i < files.length(); i++) out.put(files.getJSONObject(i));
                JSObject result = new JSObject();
                result.put("files", out);
                call.resolve(result);
            } catch (HttpError e) {
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                call.reject(e.getMessage(), "network");
            }
        });
    }

    @PluginMethod
    public void read(PluginCall call) {
        String token = call.getString("token");
        String fileId = call.getString("fileId");
        io.execute(() -> {
            try {
                byte[] bytes = request("GET", FILES + "/" + fileId + "?alt=media", token, null, null);
                JSObject result = new JSObject();
                result.put("content", new String(isGzip(bytes) ? gunzip(bytes) : bytes, StandardCharsets.UTF_8));
                call.resolve(result);
            } catch (HttpError e) {
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                call.reject(e.getMessage(), "network");
            }
        });
    }

    /** Creates `name` in the app folder, or overwrites `fileId`. */
    @PluginMethod
    public void write(PluginCall call) {
        String token = call.getString("token");
        String name = call.getString("name");
        String fileId = call.getString("fileId");
        String content = call.getString("content", "");
        io.execute(() -> {
            try {
                JSONObject meta = new JSONObject();
                meta.put("name", name);
                if (fileId == null) meta.put("parents", new JSONArray().put("appDataFolder"));
                String boundary = "bouldertracker" + System.nanoTime();
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                body.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + boundary
                    + "\r\nContent-Type: application/gzip\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                body.write(gzip(content.getBytes(StandardCharsets.UTF_8)));
                body.write(("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8));

                String url = fileId == null
                    ? UPLOAD + "?uploadType=multipart&fields=id,name"
                    : UPLOAD + "/" + fileId + "?uploadType=multipart&fields=id,name";
                // HttpURLConnection has no PATCH; Google's APIs accept it as an override on POST.
                String override = fileId == null ? null : "PATCH";
                byte[] response = request("POST", url, token, body.toByteArray(), "multipart/related; boundary=" + boundary, override);
                JSONObject file = new JSONObject(new String(response, StandardCharsets.UTF_8));
                JSObject result = new JSObject();
                result.put("id", file.optString("id"));
                result.put("name", file.optString("name"));
                call.resolve(result);
            } catch (HttpError e) {
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                call.reject(e.getMessage(), "network");
            }
        });
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        io.execute(() -> {
            try {
                if (token != null) GoogleAuthUtil.clearToken(getContext(), token);
            } catch (Exception ignored) {
                // Nothing cached; the next authorize fetches a new one either way.
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void revoke(PluginCall call) {
        String email = call.getString("email");
        if (email == null) {
            call.resolve();
            return;
        }
        RevokeAccessRequest request = RevokeAccessRequest.builder().setAccount(new Account(email, "com.google")).setScopes(SCOPES).build();
        Identity.getAuthorizationClient(getActivity())
            .revokeAccess(request)
            // Disconnecting still goes ahead in the app if Google can't be reached.
            .addOnCompleteListener(task -> call.resolve());
    }

    /**
     * `about({token})`: the signed-in account's display name and email, from
     * Drive itself - the authorization result often carries no account, so
     * the app had nothing to show but "Google account". `about.get` is
     * allowed with the app-folder scope the app already has.
     */
    @PluginMethod
    public void about(PluginCall call) {
        String token = call.getString("token");
        io.execute(() -> {
            try {
                String url = "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)";
                JSONObject body = new JSONObject(new String(request("GET", url, token, null, null), StandardCharsets.UTF_8));
                JSONObject user = body.optJSONObject("user");
                JSObject result = new JSObject();
                if (user != null) {
                    if (user.has("displayName")) result.put("name", user.optString("displayName"));
                    if (user.has("emailAddress")) result.put("email", user.optString("emailAddress"));
                }
                call.resolve(result);
            } catch (HttpError e) {
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                call.reject(e.getMessage(), "network");
            }
        });
    }

    @PluginMethod
    public void deviceName(PluginCall call) {
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "Android" : Build.MODEL;
        String name = model.toLowerCase().startsWith(maker.toLowerCase()) ? model : capitalize(maker) + " " + model;
        JSObject result = new JSObject();
        result.put("name", name.trim());
        call.resolve(result);
    }

    // --- HTTP ---

    private static final class HttpError extends Exception {
        final String code;

        HttpError(int status, String message) {
            super("Drive: HTTP " + status + (message.isEmpty() ? "" : " - " + message));
            this.code = status == 401 ? "unauthorized" : "http-" + status;
        }
    }

    private static byte[] request(String method, String url, String token, byte[] body, String contentType) throws Exception {
        return request(method, url, token, body, contentType, null);
    }

    private static byte[] request(String method, String url, String token, byte[] body, String contentType, String methodOverride) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            if (methodOverride != null) conn.setRequestProperty("X-HTTP-Method-Override", methodOverride);
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", contentType);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body);
                }
            }
            int status = conn.getResponseCode();
            if (status >= 200 && status < 300) {
                try (InputStream in = conn.getInputStream()) {
                    return readAll(in);
                }
            }
            String message = "";
            try (InputStream err = conn.getErrorStream()) {
                if (err != null) {
                    JSONObject json = new JSONObject(new String(readAll(err), StandardCharsets.UTF_8));
                    message = json.optJSONObject("error") != null ? json.getJSONObject("error").optString("message") : "";
                }
            } catch (Exception ignored) {
                // No readable error body.
            }
            throw new HttpError(status, message);
        } finally {
            conn.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        return out.toByteArray();
    }

    private static boolean isGzip(byte[] bytes) {
        return bytes.length > 2 && (bytes[0] & 0xff) == 0x1f && (bytes[1] & 0xff) == 0x8b;
    }

    private static byte[] gzip(byte[] bytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream zip = new GZIPOutputStream(out)) {
            zip.write(bytes);
        }
        return out.toByteArray();
    }

    private static byte[] gunzip(byte[] bytes) throws IOException {
        try (GZIPInputStream zip = new GZIPInputStream(new java.io.ByteArrayInputStream(bytes))) {
            return readAll(zip);
        }
    }

    private static String capitalize(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
