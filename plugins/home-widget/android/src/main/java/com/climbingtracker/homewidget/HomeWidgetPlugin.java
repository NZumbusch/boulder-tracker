package com.climbingtracker.homewidget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * - `update({snapshot})`: stores the app's widget snapshot and redraws every widget from it.
 * - `pin({kind})`: asks the launcher to add a widget ("today" / "readiness" / "week" / "quicklog" / "load") to the home screen
 *   (Android 8+, launchers that support it); resolves `{requested}`.
 */
@CapacitorPlugin(name = "HomeWidget")
public class HomeWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot missing");
            return;
        }
        WidgetRenderer.save(getContext(), snapshot);
        WidgetRenderer.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void pin(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            result.put("requested", false);
            call.resolve(result);
            return;
        }
        AppWidgetManager manager = getContext().getSystemService(AppWidgetManager.class);
        Class<?> provider = providerFor(call.getString("kind"));
        boolean ok = manager != null && manager.isRequestPinAppWidgetSupported()
            && manager.requestPinAppWidget(new ComponentName(getContext(), provider), null, null);
        result.put("requested", ok);
        call.resolve(result);
    }

    private static Class<?> providerFor(String kind) {
        if (kind == null) return TodayWidgetProvider.class;
        switch (kind) {
            case "readiness": return ReadinessWidgetProvider.class;
            case "week": return WeekWidgetProvider.class;
            case "quicklog": return QuickLogWidgetProvider.class;
            case "load": return LoadWidgetProvider.class;
            default: return TodayWidgetProvider.class;
        }
    }
}
