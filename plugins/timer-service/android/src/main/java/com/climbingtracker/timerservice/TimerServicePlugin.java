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
        TimerForegroundService.listener = (kind, at, seq) -> {
            JSObject data = new JSObject();
            data.put("kind", kind);
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

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", TimerForegroundService.instance != null);
        call.resolve(result);
    }
}
