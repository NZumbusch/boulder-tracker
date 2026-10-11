/**
 * The page's side of the Drive plugin (`plugins/drive-sync`): Google
 * sign-in for the app folder, and the folder's files as a `SyncTransport`.
 *
 * Holds the access token. Play services keeps the grant, so after the
 * first consent a silent `authorize` gets a fresh token whenever Drive
 * rejects the old one (tokens last about an hour).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { DriveFile, SyncTransport } from "../sync/syncEngine";

interface DriveSyncPlugin {
  authorize(options: { interactive: boolean }): Promise<{ token: string; email?: string }>;
  list(options: { token: string }): Promise<{ files: DriveFile[] }>;
  read(options: { token: string; fileId: string }): Promise<{ content: string }>;
  write(options: { token: string; name: string; content: string; fileId?: string }): Promise<DriveFile>;
  clearToken(options: { token: string }): Promise<void>;
  revoke(options: { email?: string }): Promise<void>;
  deviceName(): Promise<{ name: string }>;
  installMarker(): Promise<{ marker: string }>;
  about(options: { token: string }): Promise<{ name?: string; email?: string }>;
}

const DriveSync = registerPlugin<DriveSyncPlugin>("DriveSync");

export const driveSyncAvailable = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/** The plugin's error code ("consent-required", "cancelled", "unauthorized", "network", "http-403"...). */
export function driveErrorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

export class DriveClient implements SyncTransport {
  private token: string | null = null;
  email: string | undefined;

  /** Interactive shows Google's account picker / consent if needed; silent rejects with "consent-required". */
  async authorize(interactive: boolean): Promise<{ email?: string }> {
    const result = await DriveSync.authorize({ interactive });
    this.token = result.token;
    if (result.email) this.email = result.email;
    return { email: this.email };
  }

  private async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    if (!this.token) await this.authorize(false);
    try {
      return await fn(this.token!);
    } catch (err) {
      if (driveErrorCode(err) !== "unauthorized") throw err;
      // Expired: drop it and try once more with a fresh one.
      await DriveSync.clearToken({ token: this.token! });
      this.token = null;
      await this.authorize(false);
      return fn(this.token!);
    }
  }

  list(): Promise<DriveFile[]> {
    return this.withToken(async (token) => (await DriveSync.list({ token })).files);
  }

  read(fileId: string): Promise<string> {
    return this.withToken(async (token) => (await DriveSync.read({ token, fileId })).content);
  }

  write(name: string, content: string, fileId?: string): Promise<DriveFile> {
    return this.withToken((token) => DriveSync.write({ token, name, content, ...(fileId ? { fileId } : {}) }));
  }

  /** The account's name and email as Drive knows them. */
  about(): Promise<{ name?: string; email?: string }> {
    return this.withToken((token) => DriveSync.about({ token }));
  }

  async revoke(): Promise<void> {
    try {
      await DriveSync.revoke({ email: this.email });
    } finally {
      this.token = null;
    }
  }

  /** This install's marker (kept where backups don't reach), or null if it can't be read. */
  static async installMarker(): Promise<string | null> {
    try {
      return (await DriveSync.installMarker()).marker || null;
    } catch {
      return null;
    }
  }

  static async deviceName(): Promise<string> {
    try {
      return (await DriveSync.deviceName()).name;
    } catch {
      return "Android device";
    }
  }
}
