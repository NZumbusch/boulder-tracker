package com.climbingtracker.homewidget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Draws the widgets from the snapshot the app last stored (see
 * src/lib/widget/widgetSnapshot.ts for its shape). Everything that moves
 * on its own is worked out here at draw time - which day is today, the
 * running session's clock - so the widgets stay right while the app is
 * closed. Taps open the app through bouldertracker:// links.
 */
final class WidgetRenderer {
    private static final String PREFS = "bouldertracker_widget";
    private static final String KEY = "snapshot";

    private WidgetRenderer() {}

    static void save(Context context, String snapshot) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, snapshot).apply();
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class))) {
            manager.updateAppWidget(id, today(context));
        }
        for (int id : manager.getAppWidgetIds(new ComponentName(context, ReadinessWidgetProvider.class))) {
            manager.updateAppWidget(id, readiness(context));
        }
    }

    private static JSONObject snapshot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            String raw = prefs.getString(KEY, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private static String todayIso() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    // --- Readiness ring (both widgets) ---

    private static int statusColor(String status) {
        switch (status) {
            case "good": return Color.parseColor("#10B981");
            case "caution": return Color.parseColor("#F59E0B");
            case "risk": return Color.parseColor("#EF4444");
            default: return Color.parseColor("#71717A");
        }
    }

    /** Draws the ring; returns whether there was a score for today. */
    private static boolean drawRing(Context context, RemoteViews views, JSONObject snap) {
        JSONObject r = snap == null ? null : snap.optJSONObject("readiness");
        boolean current = r != null && todayIso().equals(r.optString("date")) && !r.isNull("score");
        if (!current) {
            views.setTextViewText(R.id.score, "–");
            views.setTextColor(R.id.score, context.getResources().getColor(R.color.widget_muted, null));
            views.setTextViewText(R.id.score_label, "READINESS");
            views.setProgressBar(R.id.ring, 100, 0, false);
            return false;
        }
        int score = r.optInt("score");
        String status = r.optString("status", "neutral");
        int color = statusColor(status);
        views.setTextViewText(R.id.score, String.valueOf(score));
        views.setTextColor(R.id.score, color);
        views.setTextViewText(R.id.score_label, status.toUpperCase(Locale.ROOT));
        views.setProgressBar(R.id.ring, 100, score, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(R.id.ring, "setProgressTintList", ColorStateList.valueOf(color));
        }
        return true;
    }

    static RemoteViews readiness(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_readiness);
        boolean scored = drawRing(context, views, snapshot(context));
        views.setTextViewText(R.id.caption, scored ? "Readiness" : "Tap to log metrics");
        // Tapping goes straight to logging today's metrics - what moves the score.
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://metrics"));
        return views;
    }

    // --- Today ---

    static RemoteViews today(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        JSONObject snap = snapshot(context);
        drawRing(context, views, snap);
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://view/home"));
        views.setOnClickPendingIntent(R.id.ring_tap, link(context, "bouldertracker://metrics"));
        views.setOnClickPendingIntent(R.id.primary_button, link(context, "bouldertracker://session"));
        views.setOnClickPendingIntent(R.id.log_button, link(context, "bouldertracker://quicklog"));
        views.setViewVisibility(R.id.chrono, View.GONE);
        views.setTextViewText(R.id.primary_button, "▶  Start");

        String dateLabel = new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(new Date()).toUpperCase(Locale.getDefault());
        if (snap == null) {
            views.setTextViewText(R.id.heading, "TODAY · " + dateLabel);
            views.setTextViewText(R.id.title, "Open the app once");
            views.setTextViewText(R.id.meta, "to fill in this widget");
            return views;
        }

        JSONObject active = snap.optJSONObject("active");
        if (active != null) {
            boolean paused = active.optBoolean("paused");
            long elapsed = active.optLong("elapsedMs") + (paused ? 0 : Math.max(0, System.currentTimeMillis() - snap.optLong("updatedAt")));
            views.setTextViewText(R.id.heading, paused ? "SESSION PAUSED" : "SESSION RUNNING");
            views.setTextViewText(R.id.title, active.optString("name", "Session"));
            views.setViewVisibility(R.id.chrono, View.VISIBLE);
            views.setChronometer(R.id.chrono, SystemClock.elapsedRealtime() - elapsed, null, !paused);
            views.setTextViewText(R.id.meta, "  ·  " + active.optInt("settled") + "/" + active.optInt("total") + " done");
            views.setTextViewText(R.id.primary_button, "▶  Resume");
            return views;
        }

        views.setTextViewText(R.id.heading, "TODAY · " + dateLabel);
        JSONArray days = snap.optJSONArray("days");
        String today = todayIso();
        int index = -1;
        for (int i = 0; days != null && i < days.length(); i++) {
            if (today.equals(days.optJSONObject(i).optString("date"))) index = i;
        }
        if (index < 0) {
            views.setTextViewText(R.id.title, "Open the app to update");
            views.setTextViewText(R.id.meta, "");
            return views;
        }

        JSONObject day = days.optJSONObject(index);
        JSONArray planned = day.optJSONArray("planned");
        if (planned != null && planned.length() > 0) {
            JSONObject first = planned.optJSONObject(0);
            views.setTextViewText(R.id.title, first.optString("name", "Session"));
            List<String> parts = new ArrayList<>();
            if (first.has("time")) parts.add(first.optString("time"));
            if (first.optInt("minutes") > 0) parts.add(first.optInt("minutes") + " min");
            int n = first.optInt("exercises");
            parts.add(n + (n == 1 ? " exercise" : " exercises"));
            if (planned.length() > 1) parts.add("+" + (planned.length() - 1) + " more");
            views.setTextViewText(R.id.meta, join(parts));
            return views;
        }

        int done = day.optInt("done");
        views.setTextViewText(R.id.title, done > 0 ? "Done for today ✓" : "Nothing planned");
        views.setTextViewText(R.id.meta, done > 0 ? done + (done == 1 ? " session logged" : " sessions logged") : nextPlanned(days, index));
        return views;
    }

    /** "Next: Sat · Board" - the first planned session after today, if the snapshot reaches it. */
    private static String nextPlanned(JSONArray days, int from) {
        for (int i = from + 1; i < days.length(); i++) {
            JSONObject day = days.optJSONObject(i);
            JSONArray planned = day.optJSONArray("planned");
            if (planned == null || planned.length() == 0) continue;
            String weekday;
            try {
                Date date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day.optString("date"));
                weekday = i == from + 1 ? "Tomorrow" : new SimpleDateFormat("EEE", Locale.getDefault()).format(date);
            } catch (Exception e) {
                weekday = day.optString("date");
            }
            return "Next: " + weekday + " · " + planned.optJSONObject(0).optString("name", "Session");
        }
        return "Rest day";
    }

    private static String join(List<String> parts) {
        StringBuilder out = new StringBuilder();
        for (String p : parts) {
            if (out.length() > 0) out.append("  ·  ");
            out.append(p);
        }
        return out.toString();
    }

    /** Opens the app on a bouldertracker:// link (the same ones the launcher shortcuts use). */
    private static PendingIntent link(Context context, String url) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) intent = new Intent();
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, url.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
