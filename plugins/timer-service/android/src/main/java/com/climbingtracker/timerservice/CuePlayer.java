package com.climbingtracker.timerservice;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

/**
 * Plays the timer's cues: the same short synthesized tones and vibration
 * patterns the page plays (TimerWidget's `cue()`), so a cue sounds the same
 * whether the app is open or the phone is in a pocket.
 *
 * Music keeps playing. Each cue asks for audio focus as
 * AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK with navigation-guidance attributes -
 * the way a maps app speaks over music - so a music app lowers its volume
 * for the beep and comes back, instead of pausing. Focus is held across
 * cues that follow each other closely (a 3-2-1), so the music doesn't
 * bob up and down between every tick.
 */
final class CuePlayer {
    private static final int SAMPLE_RATE = 44100;
    /** How long focus is kept after a cue, so a following tick reuses it. */
    private static final long FOCUS_LINGER_MS = 1300;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AudioManager audioManager;
    private final AudioAttributes attributes;
    private AudioFocusRequest focusRequest;
    private boolean hasFocus = false;
    private final Runnable abandonFocus = this::releaseFocus;

    CuePlayer(Context context) {
        this.context = context.getApplicationContext();
        this.audioManager = (AudioManager) this.context.getSystemService(Context.AUDIO_SERVICE);
        this.attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    /** A tone: frequency (Hz), length (ms), start offset (ms). */
    private record Tone(double freq, int durationMs, int delayMs, double gain) {}

    private static Tone[] tonesFor(String kind) {
        switch (kind) {
            case "work":
                return new Tone[] { new Tone(880, 120, 0, 0.5), new Tone(1320, 220, 120, 0.5) };
            case "rest":
                return new Tone[] { new Tone(660, 260, 0, 0.5) };
            case "setRest":
                return new Tone[] { new Tone(660, 180, 0, 0.5), new Tone(520, 180, 190, 0.5), new Tone(400, 320, 380, 0.5) };
            case "leadIn":
                return new Tone[] { new Tone(520, 200, 0, 0.5) };
            case "done":
                return new Tone[] { new Tone(660, 180, 0, 0.5), new Tone(880, 180, 190, 0.5), new Tone(1320, 420, 380, 0.5) };
            case "warn":
                return new Tone[] { new Tone(740, 90, 0, 0.45), new Tone(740, 90, 160, 0.45) };
            case "tick":
            default:
                return new Tone[] { new Tone(1000, 70, 0, 0.35) };
        }
    }

    private static long[] vibrationFor(String kind) {
        switch (kind) {
            case "work": return new long[] { 0, 120, 60, 220 };
            case "rest": return new long[] { 0, 180 };
            case "setRest": return new long[] { 0, 160, 80, 160, 80, 260 };
            case "leadIn": return new long[] { 0, 100 };
            case "done": return new long[] { 0, 200, 100, 200, 100, 400 };
            case "warn": return new long[] { 0, 80, 80, 80 };
            case "tick":
            default: return new long[] { 0, 40 };
        }
    }

    void play(String kind, boolean sound, boolean vibrate) {
        Log.d("TimerService", "cue " + kind + " sound=" + sound + " vibrate=" + vibrate);
        if (vibrate) vibrate(vibrationFor(kind));
        if (!sound) return;

        Tone[] tones = tonesFor(kind);
        int totalMs = 0;
        for (Tone t : tones) totalMs = Math.max(totalMs, t.delayMs + t.durationMs);
        short[] pcm = synthesize(tones, totalMs);

        requestFocus();
        try {
            AudioTrack track = new AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build())
                .setBufferSizeInBytes(pcm.length * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build();
            track.write(pcm, 0, pcm.length);
            track.play();
            handler.postDelayed(track::release, totalMs + 200L);
        } catch (Exception ignored) {
            // No audio this time; the vibration (if on) still happened.
        }
        handler.removeCallbacks(abandonFocus);
        handler.postDelayed(abandonFocus, totalMs + FOCUS_LINGER_MS);
    }

    private static short[] synthesize(Tone[] tones, int totalMs) {
        int length = (int) ((long) SAMPLE_RATE * totalMs / 1000) + 1;
        double[] mix = new double[length];
        for (Tone t : tones) {
            int start = (int) ((long) SAMPLE_RATE * t.delayMs / 1000);
            int count = (int) ((long) SAMPLE_RATE * t.durationMs / 1000);
            for (int i = 0; i < count && start + i < length; i++) {
                double time = (double) i / SAMPLE_RATE;
                // Quick attack, exponential decay - the page's gain ramp.
                double attack = Math.min(1.0, i / (SAMPLE_RATE * 0.004));
                double decay = Math.exp(-5.0 * i / count);
                mix[start + i] += t.gain * attack * decay * Math.sin(2 * Math.PI * t.freq * time);
            }
        }
        short[] pcm = new short[length];
        for (int i = 0; i < length; i++) {
            double v = Math.max(-1.0, Math.min(1.0, mix[i]));
            pcm[i] = (short) (v * 32000);
        }
        return pcm;
    }

    private void requestFocus() {
        if (hasFocus || audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(change -> {})
                .build();
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
        hasFocus = true;
    }

    private void releaseFocus() {
        if (!hasFocus || audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            audioManager.abandonAudioFocus(null);
        }
        hasFocus = false;
    }

    private void vibrate(long[] pattern) {
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = manager == null ? null : manager.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                vibrator.vibrate(pattern, -1);
            }
        } catch (Exception ignored) {
            // No vibration; the tone still plays.
        }
    }

    void release() {
        handler.removeCallbacksAndMessages(null);
        releaseFocus();
    }
}
