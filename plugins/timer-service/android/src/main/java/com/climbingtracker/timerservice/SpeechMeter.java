package com.climbingtracker.timerservice;

import android.content.Context;
import android.media.MediaMetadataRetriever;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.io.File;
import java.util.List;

/**
 * Measures how long phrases take to say: the speech engine renders each one
 * to a temporary audio file (nothing is played) and the file's length is the
 * answer - the real duration with the chosen engine, voice, speed and pitch,
 * so the page can plan announcements without guessing.
 */
final class SpeechMeter {
    interface Done {
        /** Seconds per text, in order; -1 for one that could not be measured. */
        void onDone(double[] seconds);
    }

    private static final long TIMEOUT_MS = 20000;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> texts;
    private final double[] seconds;
    private final String voiceName;
    private final float rate;
    private final float pitch;
    private final Done done;
    private TextToSpeech tts;
    private int index = 0;
    private boolean finished = false;
    private File current;

    private SpeechMeter(Context context, String engine, String voice, float rate, float pitch, List<String> texts, Done done) {
        this.context = context;
        this.texts = texts;
        this.seconds = new double[texts.size()];
        java.util.Arrays.fill(seconds, -1);
        this.voiceName = voice == null || voice.isEmpty() ? null : voice;
        this.rate = Math.max(0.5f, Math.min(2f, rate));
        this.pitch = Math.max(0.5f, Math.min(2f, pitch));
        this.done = done;
        handler.postDelayed(this::finish, TIMEOUT_MS);
        try {
            tts = engine == null || engine.isEmpty()
                ? new TextToSpeech(context, this::onInit)
                : new TextToSpeech(context, this::onInit, engine);
        } catch (Exception e) {
            finish();
        }
    }

    static void measure(Context context, String engine, String voice, float rate, float pitch, List<String> texts, Done done) {
        if (texts.isEmpty()) {
            done.onDone(new double[0]);
            return;
        }
        new Handler(Looper.getMainLooper()).post(() -> new SpeechMeter(context, engine, voice, rate, pitch, texts, done));
    }

    private void onInit(int status) {
        handler.post(() -> {
            if (finished) return;
            if (status != TextToSpeech.SUCCESS || tts == null) {
                finish();
                return;
            }
            try {
                tts.setSpeechRate(rate);
                tts.setPitch(pitch);
                if (voiceName != null && tts.getVoices() != null) {
                    for (Voice v : tts.getVoices()) {
                        if (voiceName.equals(v.getName())) {
                            tts.setVoice(v);
                            break;
                        }
                    }
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onError(String id) { handler.post(() -> next(false)); }
                    @Override public void onDone(String id) { handler.post(() -> next(true)); }
                });
            } catch (Exception e) {
                finish();
                return;
            }
            start();
        });
    }

    private void start() {
        if (finished) return;
        if (index >= texts.size()) {
            finish();
            return;
        }
        try {
            current = File.createTempFile("measure", ".wav", context.getCacheDir());
            int r = tts.synthesizeToFile(texts.get(index), new Bundle(), current, "m" + index);
            if (r != TextToSpeech.SUCCESS) next(false);
        } catch (Exception e) {
            next(false);
        }
    }

    private void next(boolean ok) {
        if (finished) return;
        if (ok && current != null) seconds[index] = lengthOf(current);
        if (current != null) {
            //noinspection ResultOfMethodCallIgnored
            current.delete();
            current = null;
        }
        index++;
        start();
    }

    private static double lengthOf(File file) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(file.getAbsolutePath());
            String ms = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return ms == null ? -1 : Long.parseLong(ms) / 1000.0;
        } catch (Exception e) {
            return -1;
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
    }

    private void finish() {
        if (finished) return;
        finished = true;
        handler.removeCallbacksAndMessages(null);
        if (current != null) {
            //noinspection ResultOfMethodCallIgnored
            current.delete();
        }
        try {
            if (tts != null) {
                tts.stop();
                tts.shutdown();
            }
        } catch (Exception ignored) {}
        done.onDone(seconds);
    }
}
