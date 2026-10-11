package com.climbingtracker.timerservice;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the page's session timer and TimerForegroundService.
 *
 * - `start` / `update` (the same thing): hand over the current plan. The
 *   first one starts the foreground service - which Android only allows
 *   while the app is in the foreground, so the page starts it when the
 *   timer starts, not when the app is hidden. Later ones go straight to the
 *   running service.
 * - `stop`: the timer stopped or the session ended.
 * - `action` event / `takeActions`: a notification button was pressed
 *   (`pause`, `resume`, `add30`, with the time it happened and a sequence
 *   number), for the page to mirror. The page collects them on waking,
 *   before it catches up on time; the event covers presses while it is open.
 */
@CapacitorPlugin(name = "TimerService")
public class TimerServicePlugin extends Plugin {

    @Override
    public void load() {
        TimerForegroundService.listener = (kind, at, seq, withTimer) -> {
            JSObject data = new JSObject();
            data.put("kind", kind);
            if (withTimer) data.put("withTimer", true);
            data.put("at", at);
            data.put("seq", seq);
            // Retained until the page's listener takes it, so a press while
            // the page is asleep is applied when it wakes.
            notifyListeners("action", data, true);
        };
    }

    @PluginMethod
    public void start(PluginCall call) {
        send(call);
    }

    @PluginMethod
    public void update(PluginCall call) {
        send(call);
    }

    private void send(PluginCall call) {
        String config = call.getData().toString();
        TimerForegroundService running = TimerForegroundService.instance;
        try {
            if (running != null) {
                getActivity().runOnUiThread(() -> running.applyConfig(config));
            } else {
                Intent intent = new Intent(getContext(), TimerForegroundService.class)
                    .setAction(TimerForegroundService.ACTION_START)
                    .putExtra(TimerForegroundService.EXTRA_CONFIG, config);
                ContextCompat.startForegroundService(getContext(), intent);
            }
            call.resolve();
        } catch (Exception e) {
            // E.g. Android refusing a foreground service from the background.
            call.reject("Could not start the timer service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TimerForegroundService running = TimerForegroundService.instance;
        if (running != null) getActivity().runOnUiThread(running::stopTimer);
        call.resolve();
    }

    /** Button presses since the page last asked, oldest first (see TimerForegroundService.pendingActions). */
    @PluginMethod
    public void takeActions(PluginCall call) {
        com.getcapacitor.JSArray list = new com.getcapacitor.JSArray();
        for (org.json.JSONObject a : TimerForegroundService.takeActions()) list.put(a);
        JSObject result = new JSObject();
        result.put("actions", list);
        call.resolve(result);
    }

    /**
     * The phone's text-to-speech engines and, for one of them (the default
     * when none is named), its voices - for the settings pickers.
     */
    @PluginMethod
    public void speechChoices(PluginCall call) {
        String wanted = call.getString("engine");
        final android.speech.tts.TextToSpeech[] holder = new android.speech.tts.TextToSpeech[1];
        android.speech.tts.TextToSpeech.OnInitListener onInit = status -> {
            try {
                android.speech.tts.TextToSpeech tts = holder[0];
                if (status != android.speech.tts.TextToSpeech.SUCCESS || tts == null) {
                    call.reject("Text-to-speech is not available");
                    return;
                }
                com.getcapacitor.JSArray engines = new com.getcapacitor.JSArray();
                for (android.speech.tts.TextToSpeech.EngineInfo e : tts.getEngines()) {
                    JSObject o = new JSObject();
                    o.put("name", e.name);
                    o.put("label", e.label);
                    engines.put(o);
                }
                com.getcapacitor.JSArray voices = new com.getcapacitor.JSArray();
                java.util.List<android.speech.tts.Voice> sorted = new java.util.ArrayList<>();
                if (tts.getVoices() != null) sorted.addAll(tts.getVoices());
                java.util.Collections.sort(sorted, (a, b) -> {
                    int c = a.getLocale().toLanguageTag().compareTo(b.getLocale().toLanguageTag());
                    return c != 0 ? c : a.getName().compareTo(b.getName());
                });
                for (android.speech.tts.Voice v : sorted) {
                    JSObject o = new JSObject();
                    o.put("name", v.getName());
                    o.put("locale", v.getLocale().toLanguageTag());
                    o.put("network", v.isNetworkConnectionRequired());
                    voices.put(o);
                }
                JSObject result = new JSObject();
                result.put("engines", engines);
                result.put("engine", wanted != null ? wanted : tts.getDefaultEngine());
                result.put("voices", voices);
                tts.shutdown();
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not read the speech engines: " + e.getMessage());
            }
        };
        try {
            holder[0] = wanted == null || wanted.isEmpty()
                ? new android.speech.tts.TextToSpeech(getContext(), onInit)
                : new android.speech.tts.TextToSpeech(getContext(), onInit, wanted);
        } catch (Exception e) {
            call.reject("Could not start text-to-speech: " + e.getMessage());
        }
    }

    /** How long each text takes to say with the chosen engine, voice, speed and pitch (rendered, not played); -1 where it could not be told. */
    @PluginMethod
    public void measureSpeech(PluginCall call) {
        com.getcapacitor.JSArray list = call.getArray("texts");
        java.util.List<String> texts = new java.util.ArrayList<>();
        if (list != null) {
            for (int i = 0; i < list.length(); i++) texts.add(list.optString(i, ""));
        }
        SpeechMeter.measure(getContext(), call.getString("engine"), call.getString("voice"), call.getFloat("rate", 1f), call.getFloat("pitch", 1f), texts, seconds -> {
            com.getcapacitor.JSArray out = new com.getcapacitor.JSArray();
            for (double s : seconds) {
                try { out.put(s); } catch (Exception e) { out.put(-1); }
            }
            JSObject result = new JSObject();
            result.put("seconds", out);
            call.resolve(result);
        });
    }

    private CuePlayer preview;

    /** Says a sample with the chosen engine, voice, speed and pitch - what the timer service will do. */
    @PluginMethod
    public void previewSpeech(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> {
            if (preview == null) preview = new CuePlayer(getContext());
            preview.configure(call.getFloat("volume", 1f), Boolean.TRUE.equals(call.getBoolean("volumeSetsMedia", false)));
            preview.configureSpeech(call.getString("engine"), call.getString("voice"), call.getFloat("rate", 1f), call.getFloat("pitch", 1f));
            preview.speak(text);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (preview != null) preview.release();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", TimerForegroundService.instance != null);
        call.resolve(result);
    }
}
