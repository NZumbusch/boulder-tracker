package com.climbingtracker.devicecalendar;

import android.Manifest;
import android.content.ContentProviderOperation;
import android.content.ContentProviderResult;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
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
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Access to the calendars on the device, through Android's calendar
 * provider - whatever accounts the calendar app syncs (Google, Samsung,
 * Exchange, local).
 *
 * - `getCalendarPermission` / `requestCalendarPermission`: READ_CALENDAR, `{ granted, writeGranted }`.
 * - `requestWritePermission`: WRITE_CALENDAR as well, `{ granted, writeGranted }`.
 * - `listCalendars`: `{ calendars: [{ id, name, account, color, visible, writable }] }`.
 * - `listEvents({ from, to, calendarIds })`: `{ events: [...] }` for the
 *   instances between two epoch-millisecond times, repeating events
 *   already expanded. All-day events come back with their begin/end as UTC
 *   midnights (the provider's convention); the page turns them into dates.
 *
 * - `listAppEvents({ calendarId, from })`: the events of one calendar that
 *   the app wrote (their description carries its marker) starting at or
 *   after `from`, not repeated: `{ events: [{ eventId, begin, end, allDay, title, location, description }] }`.
 * - `applyEventChanges({ calendarId, inserts, updates, deletes })`: writes
 *   them in one batch. Updates and deletes only ever touch events of that
 *   calendar that carry the marker, so nothing the app did not write can
 *   be changed. `{ inserted, updated, deleted }`.
 *
 * Writing goes through the provider like the phone's calendar app does: the
 * account's own sync (Google) then takes the events to the cloud.
 *
 * What is shown, what is written and how is decided in TypeScript
 * (src/lib/calendar/, src/lib/calendarSync/).
 */
@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CALENDAR }, alias = "calendar"),
        @Permission(strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }, alias = "calendarWrite"),
    }
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

    /** The line the app ends each event it writes with (see src/lib/calendarSync/events.ts). */
    private static final String MARKER_LIKE = "%Boulder Tracker session %";
    private static final int ACCESS_CONTRIBUTOR = 500; // CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR

    private boolean granted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean writeGranted() {
        return granted() && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject permissionState() {
        return new JSObject().put("granted", granted()).put("writeGranted", writeGranted());
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

    @PluginMethod
    public void requestWritePermission(PluginCall call) {
        if (writeGranted()) {
            call.resolve(permissionState());
        } else {
            requestPermissionForAlias("calendarWrite", call, "permissionResult");
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
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
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
                    o.put("writable", c.getInt(5) >= ACCESS_CONTRIBUTOR);
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

    @PluginMethod
    public void listAppEvents(PluginCall call) {
        if (!granted()) {
            call.reject("Calendar access has not been allowed", "permission");
            return;
        }
        final String calendarId = call.getString("calendarId");
        if (calendarId == null || !call.getData().has("from")) {
            call.reject("calendarId and from are required");
            return;
        }
        final long from = call.getData().optLong("from");
        io.execute(() -> {
            String[] projection = {
                CalendarContract.Events._ID,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.DTEND,
                CalendarContract.Events.ALL_DAY,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.DESCRIPTION,
            };
            String selection = CalendarContract.Events.CALENDAR_ID + " = ? AND " + CalendarContract.Events.DELETED + " = 0 AND "
                + CalendarContract.Events.DTSTART + " >= ? AND " + CalendarContract.Events.DESCRIPTION + " LIKE ?";
            String[] args = { calendarId, String.valueOf(from), MARKER_LIKE };
            JSArray events = new JSArray();
            try (Cursor c = getContext().getContentResolver().query(CalendarContract.Events.CONTENT_URI, projection, selection, args, CalendarContract.Events.DTSTART + " ASC")) {
                while (c != null && c.moveToNext() && events.length() < MAX_EVENTS) {
                    JSObject o = new JSObject();
                    o.put("eventId", String.valueOf(c.getLong(0)));
                    o.put("begin", c.getLong(1));
                    o.put("end", c.isNull(2) ? c.getLong(1) : c.getLong(2));
                    o.put("allDay", c.getInt(3) == 1);
                    o.put("title", c.getString(4));
                    o.put("location", c.getString(5));
                    o.put("description", c.getString(6));
                    events.put(o);
                }
                call.resolve(new JSObject().put("events", events));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not read the events", e);
            }
        });
    }

    @PluginMethod
    public void applyEventChanges(PluginCall call) {
        if (!writeGranted()) {
            call.reject("Calendar writing has not been allowed", "permission");
            return;
        }
        final String calendarId = call.getString("calendarId");
        if (calendarId == null) {
            call.reject("calendarId is required");
            return;
        }
        JSArray inserts = call.getArray("inserts", new JSArray());
        JSArray updates = call.getArray("updates", new JSArray());
        JSArray deletes = call.getArray("deletes", new JSArray());
        io.execute(() -> {
            try {
                ArrayList<ContentProviderOperation> ops = new ArrayList<>();
                // Only events of this calendar that the app wrote.
                String guard = CalendarContract.Events.CALENDAR_ID + " = ? AND " + CalendarContract.Events.DESCRIPTION + " LIKE ?";
                String[] guardArgs = { calendarId, MARKER_LIKE };
                String zone = TimeZone.getDefault().getID();
                for (int i = 0; i < inserts.length(); i++) {
                    ContentValues v = values(inserts.getJSONObject(i), zone);
                    v.put(CalendarContract.Events.CALENDAR_ID, Long.parseLong(calendarId));
                    v.put(CalendarContract.Events.HAS_ALARM, 0);
                    ops.add(ContentProviderOperation.newInsert(CalendarContract.Events.CONTENT_URI).withValues(v).build());
                }
                for (int i = 0; i < updates.length(); i++) {
                    org.json.JSONObject u = updates.getJSONObject(i);
                    Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(u.getString("eventId")));
                    ops.add(ContentProviderOperation.newUpdate(uri).withValues(values(u, zone)).withSelection(guard, guardArgs).build());
                }
                for (int i = 0; i < deletes.length(); i++) {
                    Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(deletes.getString(i)));
                    ops.add(ContentProviderOperation.newDelete(uri).withSelection(guard, guardArgs).build());
                }
                int inserted = 0, updated = 0, deleted = 0;
                if (!ops.isEmpty()) {
                    ContentProviderResult[] results = getContext().getContentResolver().applyBatch(CalendarContract.AUTHORITY, ops);
                    for (int i = 0; i < results.length; i++) {
                        if (i < inserts.length()) { if (results[i].uri != null) inserted++; }
                        else if (i < inserts.length() + updates.length()) { if (results[i].count != null) updated += results[i].count; }
                        else if (results[i].count != null) deleted += results[i].count;
                    }
                }
                call.resolve(new JSObject().put("inserted", inserted).put("updated", updated).put("deleted", deleted));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not write the events", e);
            }
        });
    }

    /** An event's columns from the page's `{ begin, end, allDay, title, location, description }`. */
    private static ContentValues values(org.json.JSONObject o, String zone) throws org.json.JSONException {
        ContentValues v = new ContentValues();
        boolean allDay = o.optBoolean("allDay");
        v.put(CalendarContract.Events.DTSTART, o.getLong("begin"));
        v.put(CalendarContract.Events.DTEND, o.getLong("end"));
        v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
        // The provider wants all-day events in UTC.
        v.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : zone);
        v.put(CalendarContract.Events.TITLE, o.optString("title"));
        v.put(CalendarContract.Events.EVENT_LOCATION, o.optString("location"));
        v.put(CalendarContract.Events.DESCRIPTION, o.optString("description"));
        return v;
    }

    private static String cap(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max);
    }

    private static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }
}
