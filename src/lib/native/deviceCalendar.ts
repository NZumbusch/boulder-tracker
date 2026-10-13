/**
 * The page's side of the device calendar plugin (`plugins/device-calendar`).
 * Android only; read-only.
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
}

interface DeviceCalendarPlugin {
  getCalendarPermission(): Promise<{ granted: boolean }>;
  requestCalendarPermission(): Promise<{ granted: boolean }>;
  listCalendars(): Promise<{ calendars: NativeCalendar[] }>;
  listEvents(options: { from: number; to: number; calendarIds: string[] }): Promise<{ events: NativeEvent[] }>;
}

export const DeviceCalendar = registerPlugin<DeviceCalendarPlugin>("DeviceCalendar");

export const deviceCalendarSupported = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
