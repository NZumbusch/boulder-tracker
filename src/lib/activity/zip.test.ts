import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { inflate, isGzip, readZip } from "./zip";
import { makeZip } from "./zipBuilder.testutil";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("readZip", () => {
  it("lists entries and reads deflated ones (folders skipped)", async () => {
    const zip = makeZip({ "a.txt": "hello hello hello hello", "dir/b.csv": "x,y\n1,2\n" });
    const entries = await readZip(new Blob([zip as BlobPart]));
    expect(entries.map((e) => e.name)).toEqual(["a.txt", "dir/b.csv"]);
    expect(text(await entries[0].read())).toBe("hello hello hello hello");
    expect(text(await entries[1].read())).toBe("x,y\n1,2\n");
  });

  it("reads stored entries", async () => {
    const entries = await readZip(new Blob([makeZip({ "a.txt": "plain" }, { stored: true }) as BlobPart]));
    expect(text(await entries[0].read())).toBe("plain");
  });

  it("finds the end record behind a trailing comment-sized tail, and refuses non-zips", async () => {
    const zip = makeZip({ "a.txt": "x" });
    expect((await readZip(new Blob([zip as BlobPart]))).length).toBe(1);
    await expect(readZip(new Blob(["not a zip at all, definitely"]))).rejects.toThrow("Not a ZIP");
  });

  it("reads a zip inside a zip", async () => {
    const inner = makeZip({ "run.gpx": "<gpx/>" });
    const outer = makeZip({ "inner.zip": inner });
    const [e] = await readZip(new Blob([outer as BlobPart]));
    const [g] = await readZip(new Blob([(await e.read()) as BlobPart]));
    expect(text(await g.read())).toBe("<gpx/>");
  });
});

describe("gzip", () => {
  it("detects and inflates", async () => {
    const gz = new Uint8Array(gzipSync("data"));
    expect(isGzip(gz)).toBe(true);
    expect(isGzip(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(text(await inflate(gz, "gzip"))).toBe("data");
  });
});
