/**
 * A small ZIP reader for activity archives (Strava, Garmin exports): lists
 * the entries from the central directory and inflates one at a time, so a
 * big archive is never held in memory whole - the file is read by slices.
 * Stored and deflated entries only (all that exporters write); ZIP64 sizes
 * and offsets are understood. Encrypted archives are refused.
 */

export interface ZipEntry {
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

const u16 = (v: DataView, at: number) => v.getUint16(at, true);
const u32 = (v: DataView, at: number) => v.getUint32(at, true);
const u64 = (v: DataView, at: number) => Number(v.getBigUint64(at, true));

async function slice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export async function inflate(bytes: Uint8Array, format: "deflate-raw" | "gzip"): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Gzip magic number. */
export const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

export async function readZip(blob: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = await slice(blob, tailStart, blob.size);
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("Not a ZIP file");
  let count = u16(tv, eocd + 10);
  let dirSize = u32(tv, eocd + 12);
  let dirOffset = u32(tv, eocd + 16);
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    // ZIP64: the locator sits right before the end record.
    const loc = eocd - 20;
    if (loc >= 0 && u32(tv, loc) === 0x07064b50) {
      const z64At = u64(tv, loc + 8);
      const z = new DataView((await slice(blob, z64At, z64At + 56)).buffer);
      count = u64(z, 32);
      dirSize = u64(z, 40);
      dirOffset = u64(z, 48);
    }
  }
  const dir = await slice(blob, dirOffset, dirOffset + dirSize);
  const dv = new DataView(dir.buffer);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= dir.length; i++) {
    if (u32(dv, p) !== 0x02014b50) break;
    const flags = u16(dv, p + 8);
    const method = u16(dv, p + 10);
    let compressed = u32(dv, p + 20);
    let size = u32(dv, p + 24);
    const nameLen = u16(dv, p + 28);
    const extraLen = u16(dv, p + 30);
    const commentLen = u16(dv, p + 32);
    let local = u32(dv, p + 42);
    const utf8 = (flags & 0x800) !== 0;
    const nameBytes = dir.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder(utf8 ? "utf-8" : "utf-8").decode(nameBytes);
    // ZIP64 extra field (id 1): the 64-bit values for whichever of these were 0xFFFFFFFF, in order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(dv, e);
      const len = u16(dv, e + 2);
      if (id === 1) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(dv, q); q += 8; }
        if (compressed === 0xffffffff) { compressed = u64(dv, q); q += 8; }
        if (local === 0xffffffff) { local = u64(dv, q); }
      }
      e += 4 + len;
    }
    p = extraEnd + commentLen;
    if (name.endsWith("/")) continue;
    const entryCompressed = compressed;
    const entryLocal = local;
    entries.push({
      name,
      size,
      async read() {
        if (flags & 1) throw new Error("Encrypted ZIP entries are not supported");
        const head = new DataView((await slice(blob, entryLocal, entryLocal + 30)).buffer);
        if (u32(head, 0) !== 0x04034b50) throw new Error("Damaged ZIP entry");
        const start = entryLocal + 30 + u16(head, 26) + u16(head, 28);
        const raw = await slice(blob, start, start + entryCompressed);
        if (method === 0) return raw;
        if (method === 8) return inflate(raw, "deflate-raw");
        throw new Error(`Unsupported ZIP compression (${method})`);
      },
    });
  }
  return entries;
}
