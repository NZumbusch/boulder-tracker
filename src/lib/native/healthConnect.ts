/**
 * The page's side of the Health Connect plugin (`plugins/health-connect`).
 * Android only; everything here is read-only.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { HealthReadings } from "../health/import";

export type HealthConnectAvailability = "available" | "notInstalled" | "updateRequired";
export type HealthKind = "restingHeartRate" | "weight" | "sleep";

export interface HealthPermissionState {
  granted: HealthKind[];
  /** May read data older than 30 days before the permission was granted. */
  history: boolean;
}

interface HealthConnectPlugin {
  availability(): Promise<{ status: HealthConnectAvailability }>;
  getHealthPermissions(): Promise<HealthPermissionState>;
  requestHealthPermissions(): Promise<HealthPermissionState>;
  openSettings(): Promise<void>;
  read(options: { from: string; to: string }): Promise<HealthReadings>;
}

export const HealthConnect = registerPlugin<HealthConnectPlugin>("HealthConnect");

export const healthConnectSupported = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
