/** Builds tiny FIT files for tests: definition + data messages with chosen fields. */
export interface FieldDef { num: number; size: number; base: number }

export class FitWriter {
  private body: number[] = [];
  constructor(private little = true) {}

  define(local: number, global: number, fields: FieldDef[], dev?: { num: number; size: number; index: number }[]) {
    this.body.push(0x40 | (dev ? 0x20 : 0) | local, 0, this.little ? 0 : 1);
    const g = this.little ? [global & 0xff, global >> 8] : [global >> 8, global & 0xff];
    this.body.push(...g, fields.length);
    for (const f of fields) this.body.push(f.num, f.size, f.base);
    if (dev) { this.body.push(dev.length); for (const d of dev) this.body.push(d.num, d.size, d.index); }
    return this;
  }

  /** Values per field, as numbers (written in the field's size, integers only). */
  data(local: number, fields: FieldDef[], values: number[], devBytes = 0) {
    this.body.push(local);
    fields.forEach((f, i) => this.int(values[i], f.size));
    for (let i = 0; i < devBytes; i++) this.body.push(0xaa);
    return this;
  }

  compressed(local: number, offset: number, fields: FieldDef[], values: number[]) {
    this.body.push(0x80 | (local << 5) | (offset & 0x1f));
    fields.forEach((f, i) => this.int(values[i], f.size));
    return this;
  }

  private int(v: number, size: number) {
    const u = BigInt.asUintN(size * 8, BigInt(Math.trunc(v)));
    const bytes: number[] = [];
    for (let i = 0; i < size; i++) bytes.push(Number((u >> BigInt(8 * i)) & 0xffn));
    this.body.push(...(this.little ? bytes : bytes.reverse()));
  }

  build(): Uint8Array {
    const header = new Uint8Array(14);
    header[0] = 14; header[1] = 0x20;
    new DataView(header.buffer).setUint32(4, this.body.length, true);
    header.set([0x2e, 0x46, 0x49, 0x54], 8);
    const out = new Uint8Array(14 + this.body.length + 2);
    out.set(header); out.set(this.body, 14);
    return out;
  }
}

export const semicircles = (deg: number) => Math.round((deg * 2 ** 31) / 180);
/** Seconds since the FIT epoch for a unix ms. */
export const fitTime = (ms: number) => Math.round((ms - Date.UTC(1989, 11, 31)) / 1000);
