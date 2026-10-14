package com.climbingtracker.devicecalendar;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PluginMethod;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Read-only access to the calendars on the device, through Android's
 * calendar provider - whatever accounts the calendar app syncs (Google,
 * Samsung, Exchange, local).
 *
 * - `getCalendarPermission` / `requestCalendarPermission`: READ_CALENDAR, `{ granted }`.
 * - `listCalendars`: `{ calendars: [{ id, name, account, color, visible }] }`.
 * - `listEvents({ from, to, calendarIds })`: `{ events: [...] }` for the
 *   instances between two epoch-millisecond times, repeating events
 *   already expanded. All-day events come back with their begin/end as UTC
 *   midnights (the provider's convention); the page turns them into dates.
 *
 * What is shown and how is decided in TypeScript (src/lib/calendar/).
 */
@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = { @Permission(strings = { Manifest.permission.READ_CALENDAR }, alias = "calendar") }
)
public class DeviceCalendarPlugin extends Plugin {
    /** A calendar can hold years of events; a few weeks of a person's own never come near this. */
    private static final int MAX_EVENTS = 3000;
    /** Longest location or description handed to the page, in characters. */
    private static final int MAX_TEXT = 2000;
    private static final int STATUS_DECLINED = 2; // CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
        super.handleOnDestroy();
    }

    private boolean granted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject permissionState() {
        return new JSObject().put("granted", granted());
    }

    @PluginMethod
    public void getCalendarPermission(PluginCall call) {
        call.resolve(permissionState());
    }

    @PluginMethod
    public void requestCalendarPermission(PluginCall call) {
        if (granted()) {
            call.resolve(permissionState());
        } else {
            requestPermissionForAlias("calendar", call, "permissionResult");
        }
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        call.resolve(permissionState());
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!granted()) {
            call.reject("Calendar access has not been allowed", "permission");
            return;
        }
        io.execute(() -> {
            String[] projection = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.VISIBLE,
            };
            JSArray calendars = new JSArray();
            try (Cursor c = getContext().getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI, projection, null, null, CalendarContract.Calendars.ACCOUNT_NAME + " ASC, " + CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC")) {
                while (c != null && c.moveToNext()) {
                    JSObject o = new JSObject();
                    o.put("id", String.valueOf(c.getLong(0)));
                    o.put("name", c.getString(1));
                    o.put("account", c.getString(2));
                    o.put("color", hex(c.getInt(3)));
                    o.put("visible", c.getInt(4) == 1);
                    calendars.put(o);
                }
                call.resolve(new JSObject().put("calendars", calendars));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not read the calendars", e);
            }
        });
    }

    @PluginMethod
    public void listEvents(PluginCall call) {
        if (!granted()) {
            call.reject("Calendar access has not been allowed", "permission");
            return;
        }
        // Epoch milliseconds are longs: `getDouble` would not see them.
        if (!call.getData().has("from") || !call.getData().has("to")) {
            call.reject("from and to are required");
            return;
        }
        final long from = call.getData().optLong("from");
        final long to = call.getData().optLong("to");
        JSArray ids = call.getArray("calendarIds");
        io.execute(() -> {
            Uri.Builder builder = CalendarContract.Instances.CONTENT_URI.buildUpon();
            ContentUris.appendId(builder, from);
            ContentUris.appendId(builder, to);

            List<String> args = new ArrayList<>();
            StringBuilder selection = new StringBuilder(CalendarContract.Events.SELF_ATTENDEE_STATUS + " != " + STATUS_DECLINED);
            if (ids != null && ids.length() > 0) {
                selection.append(" AND ").append(CalendarContract.Events.CALENDAR_ID).append(" IN (");
                for (int i = 0; i < ids.length(); i++) {
                    selection.append(i == 0 ? "?" : ",?");
                    args.add(ids.optString(i));
                }
                selection.append(")");
            } else if (ids != null) {
                // Nothing chosen: nothing to read.
                call.resolve(new JSObject().put("events", new JSArray()));
                return;
            }

            String[] projection = {
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Events.CALENDAR_ID,
                CalendarContract.Events.DISPLAY_COLOR,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.DESCRIPTION,
            };
            JSArray events = new JSArray();
            ContentResolver resolver = getContext().getContentResolver();
            try (Cursor c = resolver.query(builder.build(), projection, selection.toString(), args.toArray(new String[0]), CalendarContract.Instances.BEGIN + " ASC")) {
                while (c != null && c.moveToNext() && events.length() < MAX_EVENTS) {
                    JSObject o = new JSObject();
                    o.put("id", c.getLong(0) + ":" + c.getLong(1));
                    o.put("begin", c.getLong(1));
                    o.put("end", c.getLong(2));
                    o.put("title", c.getString(3));
                    o.put("allDay", c.getInt(4) == 1);
                    o.put("calendarId", String.valueOf(c.getLong(5)));
                    o.put("color", hex(c.getInt(6)));
                    // Where and what, for the event's detail sheet. Descriptions can be long (invitations): capped.
                    String location = c.getString(7);
                    String description = c.getString(8);
                    if (location != null && !location.trim().isEmpty()) o.put("location", cap(location.trim(), MAX_TEXT));
                    if (description != null && !description.trim().isEmpty()) o.put("description", cap(description.trim(), MAX_TEXT));
                    events.put(o);
                }
                call.resolve(new JSObject().put("events", events));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not read the events", e);
            }
        });
    }

    private static String cap(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max);
    }

    private static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }
}
