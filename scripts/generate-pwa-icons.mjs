// Renders the PWA / home-screen icons in public/icons/ from the app icon
// (assets/icon.svg's glyph and colours). Run after changing the icon:
//   node scripts/generate-pwa-icons.mjs
// iOS needs PNG for the home-screen icon (it ignores the manifest's icons
// and WebP), and Android's maskable icon wants the glyph inside the
// central safe circle, hence the smaller scale there.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const GLYPH = "m14 6l-3.75 5l2.85 3.8l-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22z";
const svg = (scale) => {
  const offset = (24 - 24 * scale) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" fill="#0a0a0b"/>` +
      `<path fill="#3b82f6" d="${GLYPH}" transform="translate(${offset} ${offset}) scale(${scale})"/></svg>`,
  );
};

const out = "public/icons";
mkdirSync(out, { recursive: true });
const jobs = [
  ["icon-192.png", 192, 0.8],
  ["icon-512.png", 512, 0.8],
  ["icon-maskable-512.png", 512, 0.6],
  ["apple-touch-icon.png", 180, 0.7],
];
for (const [name, size, scale] of jobs) {
  await sharp(svg(scale)).resize(size, size).png().toFile(`${out}/${name}`);
  console.log(`${out}/${name}`);
}
