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

    /** The widget's current height in dp (the launcher reports how tall it has been stretched), or 0 if unknown. */
    static int heightDp(AppWidgetManager manager, int id) {
        return manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
    }

    /** Tall enough to show more than the minimum: about three rows of a launcher grid. */
    private static final int TALL_DP = 170;

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class))) {
            manager.updateAppWidget(id, today(context, heightDp(manager, id)));
        }
        for (int id : manager.getAppWidgetIds(new ComponentName(context, ReadinessWidgetProvider.class))) {
            manager.updateAppWidget(id, readiness(context, heightDp(manager, id)));
        }
        for (int id : manager.getAppWidgetIds(new ComponentName(context, WeekWidgetProvider.class))) {
            manager.updateAppWidget(id, week(context, heightDp(manager, id)));
        }
        for (int id : manager.getAppWidgetIds(new ComponentName(context, QuickLogWidgetProvider.class))) {
            manager.updateAppWidget(id, quickLog(context, heightDp(manager, id)));
        }
        for (int id : manager.getAppWidgetIds(new ComponentName(context, LoadWidgetProvider.class))) {
            manager.updateAppWidget(id, load(context, heightDp(manager, id)));
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

    private static final int[] DETAIL_ROW = {R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4};
    private static final int[] DETAIL_LABEL = {R.id.d0_l, R.id.d1_l, R.id.d2_l, R.id.d3_l, R.id.d4_l};
    private static final int[] DETAIL_VALUE = {R.id.d0_v, R.id.d1_v, R.id.d2_v, R.id.d3_v, R.id.d4_v};

    static RemoteViews readiness(Context context, int heightDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_readiness);
        JSONObject snap = snapshot(context);
        boolean scored = drawRing(context, views, snap);
        showDetail(context, views, snap, heightDp);
        views.setTextViewText(R.id.caption, scored ? "Readiness" : "Tap to log metrics");
        // Tapping goes straight to logging today's metrics - what moves the score.
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://metrics"));
        return views;
    }

    /**
     * Under the ring, when the widget is tall enough and the athlete chose a detail: the factors behind
     * the score, or today's numbers (the app decides which and sends the rows; the clean look sends none).
     */
    private static void showDetail(Context context, RemoteViews views, JSONObject snap, int heightDp) {
        views.setViewVisibility(R.id.detail, View.GONE);
        JSONObject r = snap == null ? null : snap.optJSONObject("readiness");
        JSONObject detail = r == null ? null : r.optJSONObject("detail");
        if (detail == null || heightDp < TALL_DP || !todayIso().equals(r.optString("date"))) return;
        JSONArray rows = detail.optJSONArray("rows");
        if (rows == null || rows.length() == 0) return;
        views.setTextViewText(R.id.detail_title, detail.optString("title"));
        for (int i = 0; i < DETAIL_ROW.length; i++) {
            JSONObject row = i < rows.length() ? rows.optJSONObject(i) : null;
            if (row == null) {
                views.setViewVisibility(DETAIL_ROW[i], View.GONE);
                continue;
            }
            views.setViewVisibility(DETAIL_ROW[i], View.VISIBLE);
            views.setTextViewText(DETAIL_LABEL[i], row.optString("l"));
            views.setTextViewText(DETAIL_VALUE[i], row.optString("v"));
        }
        views.setViewVisibility(R.id.detail, View.VISIBLE);
    }

    // --- Today ---

    static RemoteViews today(Context context, int heightDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        JSONObject snap = snapshot(context);
        drawRing(context, views, snap);
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://view/home"));
        views.setOnClickPendingIntent(R.id.ring_tap, link(context, "bouldertracker://metrics"));
        views.setOnClickPendingIntent(R.id.primary_button, link(context, "bouldertracker://session"));
        views.setOnClickPendingIntent(R.id.log_button, link(context, "bouldertracker://quicklog"));
        views.setViewVisibility(R.id.chrono, View.GONE);
        views.setTextViewText(R.id.primary_button, "▶  Start");
        views.setViewVisibility(R.id.upcoming, View.GONE);

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
            showUpcoming(views, days, index, heightDp);
            return views;
        }

        int done = day.optInt("done");
        views.setTextViewText(R.id.title, done > 0 ? "Done for today ✓" : "Nothing planned");
        views.setTextViewText(R.id.meta, done > 0 ? done + (done == 1 ? " session logged" : " sessions logged") : nextPlanned(days, index));
        showUpcoming(views, days, index, heightDp);
        return views;
    }

    /**
     * When the widget has been stretched taller: the next few days' sessions under the buttons.
     * "from" is today's index; the list starts the day after (or today's remaining sessions when
     * there is more than the one the title shows).
     */
    private static void showUpcoming(RemoteViews views, JSONArray days, int from, int heightDp) {
        if (heightDp < TALL_DP || days == null) return;
        List<String> lines = new ArrayList<>();
        for (int i = from + 1; i < days.length() && lines.size() < 4; i++) {
            JSONObject day = days.optJSONObject(i);
            JSONArray planned = day == null ? null : day.optJSONArray("planned");
            if (planned == null) continue;
            String weekday;
            try {
                Date date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day.optString("date"));
                weekday = i == from + 1 ? "Tomorrow" : new SimpleDateFormat("EEE", Locale.getDefault()).format(date);
            } catch (Exception e) {
                weekday = day.optString("date");
            }
            for (int j = 0; j < planned.length() && lines.size() < 4; j++) {
                JSONObject s = planned.optJSONObject(j);
                if (s == null) continue;
                String time = s.has("time") ? "  " + s.optString("time") : "";
                lines.add(weekday + "  ·  " + s.optString("name", "Session") + time);
            }
        }
        if (lines.isEmpty()) return;
        StringBuilder text = new StringBuilder();
        for (String l : lines) {
            if (text.length() > 0) text.append('\n');
            text.append(l);
        }
        views.setTextViewText(R.id.upcoming, text.toString());
        views.setViewVisibility(R.id.upcoming, View.VISIBLE);
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

    // --- This week (strip) ---

    private static final String[] DAY_LETTERS = {"M", "T", "W", "T", "F", "S", "S"};
    private static final int[] DAY_LABEL = {R.id.day0_label, R.id.day1_label, R.id.day2_label, R.id.day3_label, R.id.day4_label, R.id.day5_label, R.id.day6_label};
    private static final int[] DAY_MARK = {R.id.day0_mark, R.id.day1_mark, R.id.day2_mark, R.id.day3_mark, R.id.day4_mark, R.id.day5_mark, R.id.day6_mark};

    static RemoteViews week(Context context, int heightDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_week);
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://view/plan"));
        views.setViewVisibility(R.id.week_summary, View.GONE);
        JSONObject snap = snapshot(context);
        JSONObject week = snap == null ? null : snap.optJSONObject("week");
        JSONArray strip = week == null ? null : week.optJSONArray("strip");
        int muted = context.getResources().getColor(R.color.widget_muted, null);
        int accent = context.getResources().getColor(R.color.widget_accent, null);
        for (int i = 0; i < 7; i++) {
            JSONObject cell = strip == null ? null : strip.optJSONObject(i);
            boolean today = cell != null && cell.optBoolean("today");
            String status = cell == null ? "rest" : cell.optString("status", "rest");
            views.setTextViewText(DAY_LABEL[i], DAY_LETTERS[i]);
            views.setTextColor(DAY_LABEL[i], today ? accent : muted);
            views.setTextViewText(DAY_MARK[i], markFor(status));
            views.setTextColor(DAY_MARK[i], markColor(context, status));
        }
        if (week == null) {
            views.setTextViewText(R.id.week_heading, "THIS WEEK · open the app to fill in");
            return views;
        }
        views.setTextViewText(R.id.week_heading, "THIS WEEK");
        if (heightDp >= 100) {
            List<String> parts = new ArrayList<>();
            parts.add(Math.round(week.optDouble("load")) + " load");
            if (week.optInt("planned") > 0) parts.add(week.optInt("done") + " of " + week.optInt("planned") + " sessions");
            if (!week.isNull("progress")) parts.add(Math.round(week.optDouble("progress") * 100) + "% of the plan");
            views.setTextViewText(R.id.week_summary, join(parts));
            views.setViewVisibility(R.id.week_summary, View.VISIBLE);
        }
        return views;
    }

    private static String markFor(String status) {
        switch (status) {
            case "done": return "✓";
            case "missed": return "✕";
            case "skipped": return "–";
            case "planned": return "●";
            default: return "·";
        }
    }

    private static int markColor(Context context, String status) {
        switch (status) {
            case "done": return Color.parseColor("#10B981");
            case "missed": return Color.parseColor("#EF4444");
            case "planned": return context.getResources().getColor(R.color.widget_accent, null);
            default: return context.getResources().getColor(R.color.widget_muted, null);
        }
    }

    // --- Quick log ---

    private static final int[] QUICK_BUTTONS = {R.id.q0, R.id.q1, R.id.q2, R.id.q3};

    static RemoteViews quickLog(Context context, int heightDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quicklog);
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://quicklog"));
        JSONObject snap = snapshot(context);
        JSONArray ids = snap == null ? null : snap.optJSONArray("quickLog");
        List<String> shown = new ArrayList<>();
        for (int i = 0; ids != null && i < ids.length(); i++) shown.add(ids.optString(i));
        // An older snapshot (or none yet) has no list: offer all four.
        if (ids == null) {
            shown.add("pain");
            shown.add("bodyweight");
            shown.add("send");
            shown.add("benchmark");
        }
        for (int i = 0; i < QUICK_BUTTONS.length; i++) {
            if (i >= shown.size()) {
                views.setViewVisibility(QUICK_BUTTONS[i], View.GONE);
                continue;
            }
            String id = shown.get(i);
            views.setViewVisibility(QUICK_BUTTONS[i], View.VISIBLE);
            views.setTextViewText(QUICK_BUTTONS[i], quickLabel(id));
            views.setOnClickPendingIntent(QUICK_BUTTONS[i], link(context, "bouldertracker://quicklog/" + id));
        }
        return views;
    }

    private static String quickLabel(String id) {
        switch (id) {
            case "pain": return "Pain";
            case "bodyweight": return "Weight";
            case "send": return "Send";
            case "benchmark": return "Test";
            default: return id;
        }
    }

    // --- Week load ---

    static RemoteViews load(Context context, int heightDp) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_load);
        views.setOnClickPendingIntent(R.id.widget_root, link(context, "bouldertracker://view/analytics"));
        JSONObject snap = snapshot(context);
        JSONObject week = snap == null ? null : snap.optJSONObject("week");
        if (week == null) {
            views.setTextViewText(R.id.load_value, "–");
            views.setTextViewText(R.id.load_sessions, "Open the app to fill in");
            views.setTextViewText(R.id.load_acwr, "");
            views.setProgressBar(R.id.load_progress, 100, 0, false);
            return views;
        }
        views.setTextViewText(R.id.load_value, String.valueOf(Math.round(week.optDouble("load"))));
        int planned = week.optInt("planned");
        views.setTextViewText(R.id.load_sessions, planned > 0 ? week.optInt("done") + " of " + planned + " sessions" : "Nothing planned");
        double progress = week.isNull("progress") ? 0 : week.optDouble("progress");
        views.setProgressBar(R.id.load_progress, 100, (int) Math.max(0, Math.min(100, Math.round(progress * 100))), false);
        JSONObject acwr = week.optJSONObject("acwr");
        if (acwr == null) {
            views.setTextViewText(R.id.load_acwr, "ACWR after 4 weeks of data");
            views.setTextColor(R.id.load_acwr, context.getResources().getColor(R.color.widget_muted, null));
        } else {
            String zone = acwr.optString("zone");
            String name = "sweet".equals(zone) ? "sweet spot" : "risk".equals(zone) ? "high risk" : zone;
            views.setTextViewText(R.id.load_acwr, String.format(Locale.US, "ACWR %.2f · %s", acwr.optDouble("ratio"), name));
            views.setTextColor(R.id.load_acwr, zoneColor(context, zone));
        }
        return views;
    }

    private static int zoneColor(Context context, String zone) {
        switch (zone) {
            case "sweet": return Color.parseColor("#10B981");
            case "caution": return Color.parseColor("#F59E0B");
            case "risk": return Color.parseColor("#EF4444");
            default: return context.getResources().getColor(R.color.widget_muted, null);
        }
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
