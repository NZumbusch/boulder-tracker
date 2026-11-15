/**
 * The page's side of the device calendar plugin (`plugins/device-calendar`).
 * Android only. Reads any calendar; writes only the app's own session
 * events into the calendar chosen for them (`lib/calendarSync`).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeCalendar {
  id: string;
  name: string;
  /** The account it syncs with, e.g. an email address. */
  account: string;
  color: string;
  /** Shown in the phone's own calendar app. */
  visible: boolean;
  /** Events can be added to it (absent from an app built before writing existed). */
  writable?: boolean;
}

/** An event the app writes: epoch ms, all-day ones on UTC midnights with the end exclusive. */
export interface NativeEventInput {
  begin: number;
  end: number;
  allDay: boolean;
  title: string;
  location: string;
  description: string;
}

/** An event the app wrote earlier, as the calendar holds it now. */
export interface NativeAppEvent {
  eventId: string;
  begin: number;
  end: number;
  allDay: boolean;
  title: string | null;
  location: string | null;
  description: string | null;
}

interface PermissionResult {
  granted: boolean;
  /** Absent from an app built before writing existed. */
  writeGranted?: boolean;
}

export interface NativeEvent {
  id: string;
  /** Epoch ms. An all-day event's begin/end are UTC midnights, end exclusive. */
  begin: number;
  end: number;
  title: string | null;
  allDay: boolean;
  calendarId: string;
  color: string;
  /** Where it takes place, and its notes - when the event has them. */
  location?: string;
  description?: string;
}

interface DeviceCalendarPlugin {
  getCalendarPermission(): Promise<PermissionResult>;
  requestCalendarPermission(): Promise<PermissionResult>;
  requestWritePermission(): Promise<PermissionResult>;
  listCalendars(): Promise<{ calendars: NativeCalendar[] }>;
  listEvents(options: { from: number; to: number; calendarIds: string[] }): Promise<{ events: NativeEvent[] }>;
  listAppEvents(options: { calendarId: string; from: number }): Promise<{ events: NativeAppEvent[] }>;
  applyEventChanges(options: {
    calendarId: string;
    inserts: NativeEventInput[];
    updates: (NativeEventInput & { eventId: string })[];
    deletes: string[];
  }): Promise<{ inserted: number; updated: number; deleted: number }>;
}

export const DeviceCalendar = registerPlugin<DeviceCalendarPlugin>("DeviceCalendar");

export const deviceCalendarSupported = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
