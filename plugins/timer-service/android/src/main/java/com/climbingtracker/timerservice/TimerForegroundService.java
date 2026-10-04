package com.climbingtracker.timerservice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The session timer while the app is in the background (or the phone is
 * locked): an ongoing notification whose clock ticks by itself, and the
 * timer's cues played on time.
 *
 * The page stays the owner of the timer. It sends the whole plan - what
 * the notification says when (`segments`), and every cue with its time
 * (`cues`), built by `src/lib/timer/liveTimer.ts` - and re-sends it
 * whenever the timer changes. This service just carries that plan out, so
 * nothing depends on the page being awake.
 *
 * The notification's Pause / Resume / +30 s buttons act here straight away
 * (so the countdown and the beeps are right even while the page is
 * asleep) and are reported to the page, which applies the same change to
 * its own state when it next runs.
 *
 * A partial wake lock is held while a plan is running: without it the
 * CPU sleeps with the screen off and the cues would drift or bunch up.
 * It is released when the timer stops, pauses or finishes.
 */
public class TimerForegroundService extends Service {
    static final String ACTION_START = "com.climbingtracker.timerservice.START";
    static final String ACTION_PAUSE = "com.climbingtracker.timerservice.PAUSE";
    static final String ACTION_RESUME = "com.climbingtracker.timerservice.RESUME";
    static final String ACTION_ADD30 = "com.climbingtracker.timerservice.ADD30";
    static final String ACTION_SESSION_PAUSE = "com.climbingtracker.timerservice.SESSION_PAUSE";
    static final String ACTION_SESSION_RESUME = "com.climbingtracker.timerservice.SESSION_RESUME";
    static final String EXTRA_CONFIG = "config";

    private static final String CHANNEL_ID = "timer_live";
    private static final int NOTIFICATION_ID = 4711;

    /** Tells the plugin (and so the page) about a notification button press. */
    interface ActionListener {
        void onAction(String kind, long at, long seq, boolean withTimer);
    }

    /**
     * Every button press, numbered, kept until the page collects them
     * (`takeActions`). An event alone isn't enough: when the page wakes it
     * catches up on elapsed time first, and would see a paused countdown as
     * already run out before the event arrived.
     */
    static final List<JSONObject> pendingActions = new ArrayList<>();
    private static long actionSeq = 0;

    static synchronized List<JSONObject> takeActions() {
        List<JSONObject> out = new ArrayList<>(pendingActions);
        pendingActions.clear();
        return out;
    }

    static volatile TimerForegroundService instance;
    static volatile ActionListener listener;

    private static final class Segment {
        long endsAt; // 0 = not a countdown
        long startedAt; // 0 = not a count-up
        String title;
        String body;
        /** This segment's own buttons (the session's, after a timer); null = the plan's. */
        List<String> actions;
    }

    private static final class Cue {
        long at;
        String kind;
        /** For "speak": what to say. */
        String text;
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private CuePlayer player;
    private PowerManager.WakeLock wakeLock;

    private final List<Segment> segments = new ArrayList<>();
    private final List<Cue> cues = new ArrayList<>();
    private final List<String> actions = new ArrayList<>();
    private String finishedTitle = "Timer";
    private boolean sound = true;
    private boolean vibrate = true;
    /** Epoch ms paused at (from the notification), or 0. */
    private long pausedAt = 0;
    /** The timer was paused by the session's pause (not by its own button). */
    private boolean timerPausedBySession = false;
    private boolean foreground = false;
    /** The segment the notification shows now, to tell when it has moved on without us noticing. */
    private Segment shownSegment;

    /** How often the notification is checked against the clock, in case the handler's own timers ran late. */
    private static final long WATCHDOG_MS = 4000;

    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            catchUp();
            if (!segments.isEmpty()) handler.postDelayed(this, WATCHDOG_MS);
        }
    };

    /** The screen coming on is the moment the notification is looked at; make sure it is right. */
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            catchUp();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        player = new CuePlayer(this);
        ensureChannel();
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenReceiver, filter);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            pauseFromNotification();
        } else if (ACTION_RESUME.equals(action)) {
            resumeFromNotification();
        } else if (ACTION_ADD30.equals(action)) {
            add30FromNotification();
        } else if (ACTION_SESSION_PAUSE.equals(action) || ACTION_SESSION_RESUME.equals(action)) {
            sessionFromNotification(ACTION_SESSION_PAUSE.equals(action));
        } else if (intent != null && intent.hasExtra(EXTRA_CONFIG)) {
            applyConfig(intent.getStringExtra(EXTRA_CONFIG));
        }
        // Not restarted by the system on its own: without the page there is
        // no plan to run, and a stale countdown would be worse than none.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(screenReceiver); } catch (IllegalArgumentException ignored) { /* never registered */ }
        handler.removeCallbacksAndMessages(null);
        if (player != null) player.release();
        releaseWakeLock();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    // --- The plan ---------------------------------------------------------

    /** Replaces the plan with a new one from the page. */
    void applyConfig(String json) {
        try {
            JSONObject config = new JSONObject(json);
            segments.clear();
            JSONArray segs = config.optJSONArray("segments");
            if (segs != null) {
                for (int i = 0; i < segs.length(); i++) {
                    JSONObject s = segs.getJSONObject(i);
                    Segment seg = new Segment();
                    seg.endsAt = s.optLong("endsAt", 0);
                    seg.startedAt = s.optLong("startedAt", 0);
                    seg.title = s.optString("title", "Timer");
                    seg.body = s.optString("body", "");
                    JSONArray segActions = s.optJSONArray("actions");
                    if (segActions != null) {
                        seg.actions = new ArrayList<>();
                        for (int k = 0; k < segActions.length(); k++) seg.actions.add(segActions.getString(k));
                    }
                    segments.add(seg);
                }
            }
            cues.clear();
            JSONArray cs = config.optJSONArray("cues");
            if (cs != null) {
                for (int i = 0; i < cs.length(); i++) {
                    JSONObject c = cs.getJSONObject(i);
                    Cue cue = new Cue();
                    cue.at = c.optLong("at", 0);
                    cue.kind = c.optString("kind", "tick");
                    cue.text = c.optString("text", "");
                    cues.add(cue);
                }
            }
            actions.clear();
            JSONArray as = config.optJSONArray("actions");
            if (as != null) for (int i = 0; i < as.length(); i++) actions.add(as.getString(i));
            finishedTitle = config.optString("finishedTitle", "Timer");
            sound = config.optBoolean("sound", true);
            vibrate = config.optBoolean("vibrate", true);
            player.configure((float) config.optDouble("volume", 1.0), config.optBoolean("volumeSetsMedia", false));
            player.setTones(config.optJSONObject("tones"));
            JSONObject speech = config.optJSONObject("speech");
            if (speech != null) {
                player.configureSpeech(
                    speech.isNull("engine") ? null : speech.optString("engine", null),
                    speech.isNull("voice") ? null : speech.optString("voice", null),
                    (float) speech.optDouble("rate", 1.0),
                    (float) speech.optDouble("pitch", 1.0));
            }
            pausedAt = 0;
            timerPausedBySession = false;
        } catch (Exception e) {
            return;
        }
        if (segments.isEmpty()) {
            stopTimer();
            return;
        }
        replan();
    }

    /** Schedules every future cue and every notification change, from now. */
    private void replan() {
        handler.removeCallbacksAndMessages(null);
        long now = System.currentTimeMillis();
        Log.d("TimerService", "plan: " + segments.size() + " segments, " + cues.size() + " cues, paused=" + (pausedAt != 0));

        for (Cue cue : cues) {
            long delay = cue.at - now;
            if (delay < -250) continue; // already past
            final String kind = cue.kind;
            final String text = cue.text;
            handler.postDelayed(() -> {
                if ("speak".equals(kind)) speak(text);
                else player.play(kind, sound, vibrate);
            }, Math.max(0, delay));
        }
        for (Segment seg : segments) {
            if (seg.endsAt > now) handler.postDelayed(this::render, seg.endsAt - now + 30);
        }
        long lastEnd = lastCountdownEnd();
        if (lastEnd > 0 && !hasOpenEndedSegment()) {
            handler.postDelayed(this::finish, Math.max(0, lastEnd - now) + 1500);
        }
        render();
        if (pausedAt == 0) handler.postDelayed(watchdog, WATCHDOG_MS);
        if (isPlanActive(now)) acquireWakeLock();
        else releaseWakeLock();
    }

    private String lastSpoken = "";
    private long lastSpokenAt = 0;

    /** A plan re-sent a moment after an announcement was due must not say it twice. */
    private void speak(String text) {
        long now = System.currentTimeMillis();
        if (text.equals(lastSpoken) && now - lastSpokenAt < 2500) return;
        lastSpoken = text;
        lastSpokenAt = now;
        player.speak(text);
    }

    private boolean isPlanActive(long now) {
        if (pausedAt != 0) return false;
        for (Cue cue : cues) if (cue.at > now) return true;
        for (Segment seg : segments) if (seg.endsAt > now) return true;
        return false;
    }

    private long lastCountdownEnd() {
        long last = 0;
        for (Segment seg : segments) last = Math.max(last, seg.endsAt);
        for (Cue cue : cues) last = Math.max(last, cue.at);
        return last;
    }

    private boolean hasOpenEndedSegment() {
        for (Segment seg : segments) if (seg.endsAt == 0) return true;
        return false;
    }

    /** The segment showing now: the first that hasn't ended, else the last. */
    private Segment currentSegment(long now) {
        for (Segment seg : segments) {
            if (seg.endsAt == 0 || seg.endsAt > now) return seg;
        }
        return segments.isEmpty() ? null : segments.get(segments.size() - 1);
    }

    /**
     * Android can hold the handler's timers back (Doze, battery savers), and
     * a countdown notification then keeps counting past zero - as negative
     * time. This puts the notification on the right segment whenever it is
     * called, and finishes a plan that ran out unseen.
     */
    private void catchUp() {
        if (pausedAt != 0 || segments.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (currentSegment(now) != shownSegment) render();
        long lastEnd = lastCountdownEnd();
        if (lastEnd > 0 && !hasOpenEndedSegment() && now > lastEnd + 1500) finish();
    }

    // --- Notification buttons ---------------------------------------------

    private void pauseFromNotification() {
        Log.d("TimerService", "notification: pause");
        if (pausedAt != 0) return;
        long now = System.currentTimeMillis();
        pausedAt = now;
        handler.removeCallbacksAndMessages(null);
        actions.clear();
        actions.add("resume");
        render();
        releaseWakeLock();
        notifyListener("pause", now);
    }

    private void resumeFromNotification() {
        Log.d("TimerService", "notification: resume");
        long now = System.currentTimeMillis();
        if (pausedAt != 0) {
            long shift = now - pausedAt;
            for (Cue cue : cues) if (cue.at >= pausedAt) cue.at += shift;
            for (Segment seg : segments) {
                if (seg.endsAt >= pausedAt) seg.endsAt += shift;
                // The session's own segment (its buttons) keeps running through a timer pause.
                if (seg.startedAt > 0 && seg.actions == null) seg.startedAt += shift;
            }
            pausedAt = 0;
        }
        actions.clear();
        actions.add("pause");
        if (!hasOpenEndedSegment()) actions.add("add30");
        replan();
        notifyListener("resume", now);
    }

    private void add30FromNotification() {
        long now = System.currentTimeMillis();
        for (Cue cue : cues) if (cue.at > now) cue.at += 30_000;
        for (Segment seg : segments) if (seg.endsAt > now) seg.endsAt += 30_000;
        replan();
        notifyListener("add30", now);
    }

    /**
     * Session pause/resume: the page owns the session, so this only reports
     * it and shows it straight away (the clock frozen, or running on from
     * where it stopped); the page answers with a fresh plan.
     *
     * A running timer is paused with the session (and resumed with it, if
     * it was this pause that stopped it), so a rest doesn't keep counting
     * while the session is paused - also while the page is asleep. The
     * timer's own buttons stay independent: resuming just the timer leaves
     * the session paused.
     */
    private void sessionFromNotification(boolean pause) {
        long now = System.currentTimeMillis();
        boolean withTimer = false;
        if (pause) {
            Segment current = currentSegment(now);
            if (pausedAt == 0 && current != null && current.actions == null && actions.contains("pause")) {
                pauseFromNotification();
                timerPausedBySession = true;
                withTimer = true;
            }
        } else if (timerPausedBySession && pausedAt != 0) {
            resumeFromNotification();
            withTimer = true;
        }
        if (!pause) timerPausedBySession = false;

        for (Segment seg : segments) {
            if (seg.actions == null) continue;
            if (pause && seg.startedAt > 0) {
                seg.body = "Paused · " + format(now - seg.startedAt) + " · " + seg.body;
                seg.startedAt = 0;
                seg.actions = new ArrayList<>(java.util.Collections.singletonList("sessionResume"));
            } else if (!pause) {
                seg.actions = new ArrayList<>(java.util.Collections.singletonList("sessionPause"));
            }
        }
        render();
        notifyListener(pause ? "sessionPause" : "sessionResume", now, withTimer);
    }

    private void notifyListener(String kind, long at) {
        notifyListener(kind, at, false);
    }

    private void notifyListener(String kind, long at, boolean withTimer) {
        long seq;
        synchronized (TimerForegroundService.class) {
            seq = ++actionSeq;
            try {
                JSONObject action = new JSONObject().put("kind", kind).put("at", at).put("seq", seq);
                if (withTimer) action.put("withTimer", true);
                pendingActions.add(action);
            } catch (Exception ignored) {
                // JSONObject.put only throws for NaN numbers.
            }
        }
        ActionListener l = listener;
        if (l != null) l.onAction(kind, at, seq, withTimer);
    }

    // --- Lifecycle ----------------------------------------------------------

    /** Everything has run out: leave a plain, dismissible "done" notification. */
    private void finish() {
        Log.d("TimerService", "finished");
        handler.removeCallbacksAndMessages(null);
        releaseWakeLock();
        Notification done = baseBuilder()
            .setContentTitle(finishedTitle)
            .setContentText(segments.isEmpty() ? "" : segments.get(segments.size() - 1).body)
            .setOngoing(false)
            .setAutoCancel(true)
            .setShowWhen(false)
            .build();
        stopForegroundCompat(false);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, done);
        stopSelf();
    }

    /** Stopped by the page: the notification goes away too. */
    void stopTimer() {
        handler.removeCallbacksAndMessages(null);
        releaseWakeLock();
        stopForegroundCompat(true);
        stopSelf();
    }

    private void stopForegroundCompat(boolean remove) {
        if (!foreground) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(remove ? STOP_FOREGROUND_REMOVE : STOP_FOREGROUND_DETACH);
        } else {
            stopForeground(remove);
        }
        foreground = false;
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ClimbingTracker:SessionTimer");
        // A ceiling, not the expected length: re-acquired on every replan.
        wakeLock.acquire(3 * 60 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    // --- Notification -------------------------------------------------------

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        // Low importance: silent and not popping up. The cues are this
        // service's own sounds; the notification only has to be there.
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Running timer", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("The session timer while the app is in the background");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    private NotificationCompat.Builder baseBuilder() {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setOnlyAlertOnce(true)
            .setSilent(true);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            b.setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return b;
    }

    private PendingIntent actionIntent(String action, int code) {
        Intent i = new Intent(this, TimerForegroundService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void render() {
        long now = System.currentTimeMillis();
        Segment seg = currentSegment(now);
        if (seg == null) return;
        shownSegment = seg;

        NotificationCompat.Builder b = baseBuilder().setOngoing(true).setContentText(seg.body);
        if (pausedAt != 0) {
            long left = seg.endsAt > 0 ? Math.max(0, seg.endsAt - pausedAt) : 0;
            b.setContentTitle(left > 0 ? "Paused · " + format(left) + " left" : "Paused").setShowWhen(false);
        } else if (seg.endsAt > now) {
            b.setContentTitle(seg.title).setWhen(seg.endsAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        } else if (seg.startedAt > 0) {
            b.setContentTitle(seg.title).setWhen(seg.startedAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(false);
        } else {
            b.setContentTitle(seg.title).setShowWhen(false);
        }

        int code = 1;
        // Paused from here: Resume, whatever the segment carried.
        java.util.List<String> shown = pausedAt != 0 ? java.util.Collections.singletonList("resume") : (seg.actions != null ? seg.actions : actions);
        for (String a : shown) {
            switch (a) {
                case "pause": b.addAction(0, "Pause", actionIntent(ACTION_PAUSE, code++)); break;
                case "resume": b.addAction(0, "Resume", actionIntent(ACTION_RESUME, code++)); break;
                case "add30": b.addAction(0, "+30 s", actionIntent(ACTION_ADD30, code++)); break;
                case "sessionPause": b.addAction(0, "Pause session", actionIntent(ACTION_SESSION_PAUSE, code++)); break;
                case "sessionResume": b.addAction(0, "Resume session", actionIntent(ACTION_SESSION_RESUME, code++)); break;
                default: break;
            }
        }

        Notification n = b.build();
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            foreground = true;
        } else {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
    }

    private static String format(long ms) {
        long s = Math.round(ms / 1000.0);
        return (s / 60) + ":" + String.format(java.util.Locale.ROOT, "%02d", s % 60);
    }
}
