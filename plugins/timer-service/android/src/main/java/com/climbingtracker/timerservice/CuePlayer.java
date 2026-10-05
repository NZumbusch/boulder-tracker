package com.climbingtracker.timerservice;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

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
 *
 * Loudness is the page's setting: the tones are scaled by it and, when
 * asked, the phone's media volume is set to it for as long as focus is held
 * (then put back). Announcements (text-to-speech) go through the same focus
 * and volume.
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

    /** 0.1 - 1; scales the tones and the speech. */
    private volatile float volume = 1f;
    /** Set the media volume to `volume` while a cue plays. */
    private volatile boolean volumeSetsMedia = false;
    /** The media volume index to put back, or -1 when it is not changed. */
    private int savedMediaVolume = -1;

    private static final long PAUSE_MS = 400;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String pendingSpeech;

    /** The page's chosen beep style; null kinds fall back to the built-in classic table. */
    private volatile Map<String, Tone[]> customTones = new HashMap<>();

    private String speechEngine = null;
    private String speechVoice = null;
    private float speechRate = 1f;
    private float speechPitch = 1f;
    /** The engine the live `tts` was created for. */
    private String ttsEngine = null;

    CuePlayer(Context context) {
        this.context = context.getApplicationContext();
        this.audioManager = (AudioManager) this.context.getSystemService(Context.AUDIO_SERVICE);
        this.attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    void configure(float volume, boolean volumeSetsMedia) {
        this.volume = Math.max(0.1f, Math.min(1f, volume));
        this.volumeSetsMedia = volumeSetsMedia;
    }

    /** A tone: frequency (Hz), length (ms), start offset (ms). */
    private record Tone(double freq, int durationMs, int delayMs, double gain) {}

    /** The page's tones for `kind` (see cueSound.ts), else the built-in ones. */
    private Tone[] tonesFor(String kind) {
        Tone[] custom = customTones.get(kind);
        return custom != null ? custom : defaultTonesFor(kind);
    }

    /** `{kind: [[freq, ms, delay, gain?], ...]}` as the page sends it. The page's gains are for Web Audio; native ones run 2.5x. */
    void setTones(JSONObject table) {
        Map<String, Tone[]> next = new HashMap<>();
        if (table != null) {
            java.util.Iterator<String> kinds = table.keys();
            while (kinds.hasNext()) {
                String kind = kinds.next();
                JSONArray list = table.optJSONArray(kind);
                if (list == null || list.length() == 0) continue;
                Tone[] tones = new Tone[list.length()];
                try {
                    for (int i = 0; i < list.length(); i++) {
                        JSONArray t = list.getJSONArray(i);
                        double gain = t.isNull(3) ? 0.2 : t.optDouble(3, 0.2);
                        tones[i] = new Tone(t.getDouble(0), t.getInt(1), t.getInt(2), gain * 2.5);
                    }
                    next.put(kind, tones);
                } catch (Exception ignored) {
                    // A malformed entry: that cue keeps the built-in tones.
                }
            }
        }
        customTones = next;
    }

    /** Engine and voice by name (null = the phone's default), speed and pitch (1 = normal). */
    void configureSpeech(String engine, String voice, float rate, float pitch) {
        speechEngine = engine == null || engine.isEmpty() ? null : engine;
        speechVoice = voice == null || voice.isEmpty() ? null : voice;
        speechRate = Math.max(0.5f, Math.min(2f, rate));
        speechPitch = Math.max(0.5f, Math.min(2f, pitch));
        // A different engine needs a fresh instance; the next announcement creates it.
        if (tts != null && !java.util.Objects.equals(ttsEngine, speechEngine)) {
            tts.stop();
            tts.shutdown();
            tts = null;
            ttsReady = false;
        }
    }

    private static Tone[] defaultTonesFor(String kind) {
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

        applyMediaVolume();
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

    private short[] synthesize(Tone[] tones, int totalMs) {
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
            pcm[i] = (short) (v * 32000 * volume);
        }
        return pcm;
    }

    /** Says `text` aloud (queued until the speech engine is up on the first call). */
    void speak(String text) {
        if (text == null || text.isEmpty()) return;
        Log.d("TimerService", "speak: " + text);
        if (tts == null) {
            pendingSpeech = text;
            ttsEngine = speechEngine;
            tts = new TextToSpeech(context, status -> handler.post(() -> {
                if (status != TextToSpeech.SUCCESS) {
                    Log.d("TimerService", "text-to-speech unavailable");
                    return;
                }
                tts.setAudioAttributes(attributes);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    // Only the last part of an announcement ends it; the earlier parts and the pauses are not "done".
                    @Override public void onError(String id) { if ("cue".equals(id)) handler.post(() -> scheduleAbandon(0)); }
                    @Override public void onDone(String id) { if ("cue".equals(id)) handler.post(() -> scheduleAbandon(0)); }
                });
                ttsReady = true;
                if (pendingSpeech != null) {
                    String queued = pendingSpeech;
                    pendingSpeech = null;
                    speakNow(queued);
                }
            }), speechEngine);
            return;
        }
        if (!ttsReady) {
            pendingSpeech = text;
            return;
        }
        speakNow(text);
    }

    private void speakNow(String text) {
        applyMediaVolume();
        requestFocus();
        applySpeechSettings();
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
        // U+001F marks a short silence ("Next" ... the name); the parts are queued with a pause between.
        String[] parts = text.split("\u001f");
        int mode = TextToSpeech.QUEUE_FLUSH;
        for (int i = 0; i < parts.length; i++) {
            if (parts[i].isEmpty()) continue;
            if (mode != TextToSpeech.QUEUE_FLUSH) tts.playSilentUtterance(PAUSE_MS, TextToSpeech.QUEUE_ADD, "pause");
            boolean last = true;
            for (int j = i + 1; j < parts.length; j++) if (!parts[j].isEmpty()) last = false;
            tts.speak(parts[i], mode, params, last ? "cue" : "part");
            mode = TextToSpeech.QUEUE_ADD;
        }
        // Safety net if no "done" arrives; the utterance listener normally ends focus sooner.
        scheduleAbandon(8000);
    }

    private void applySpeechSettings() {
        try {
            tts.setSpeechRate(speechRate);
            tts.setPitch(speechPitch);
            if (speechVoice != null && tts.getVoices() != null) {
                for (android.speech.tts.Voice v : tts.getVoices()) {
                    if (speechVoice.equals(v.getName())) {
                        tts.setVoice(v);
                        break;
                    }
                }
            }
        } catch (Exception ignored) {
            // The engine's own defaults then.
        }
    }

    private void scheduleAbandon(long afterMs) {
        handler.removeCallbacks(abandonFocus);
        handler.postDelayed(abandonFocus, afterMs + FOCUS_LINGER_MS);
    }

    /** With the option on: the media volume is the cue volume while focus is held. */
    private void applyMediaVolume() {
        if (!volumeSetsMedia || audioManager == null) return;
        try {
            if (savedMediaVolume < 0) savedMediaVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
            int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, Math.max(1, Math.round(volume * max)), 0);
        } catch (Exception ignored) {
            // Do-not-disturb can refuse volume changes; the cue plays at the current volume.
        }
    }

    private void restoreMediaVolume() {
        if (savedMediaVolume < 0 || audioManager == null) return;
        try {
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, savedMediaVolume, 0);
        } catch (Exception ignored) {
            // Same as above.
        }
        savedMediaVolume = -1;
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
        restoreMediaVolume();
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
        restoreMediaVolume();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
            ttsReady = false;
        }
    }
}
