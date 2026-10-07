// Render the PNG copies that platforms require from the original SVG sources in public/:
// the social share card (Open Graph and X cards do not accept SVG) and home-screen icons
// (iOS uses apple-touch-icon PNGs; Android installs prefer 192 and 512 px PNGs).
// The SVGs stay the source of truth; rerun `npm run raster` after changing them.
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const font = async (path) => (await readFile(path)).toString('base64');
// The share card's text is set in the game's own fonts, embedded for the render.
const brandFonts = `<style>
@font-face { font-family: 'Bebas Neue'; src: url(data:font/woff2;base64,${await font('node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Inter Variable'; font-weight: 100 900; src: url(data:font/woff2;base64,${await font('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}) format('woff2'); }
svg text { font-family: 'Inter Variable', sans-serif; font-weight: 600; font-size: 30px; }
svg text:nth-of-type(1), svg text:nth-of-type(2) { font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 116px; letter-spacing: 2px; }
</style>`;

const outputs = [
  {
    source: 'public/share.svg',
    target: 'public/share.png',
    width: 1200,
    height: 630,
    inline: true,
  },
  { source: 'public/icon.svg', target: 'public/icon-192.png', width: 192, height: 192 },
  { source: 'public/icon.svg', target: 'public/icon-512.png', width: 512, height: 512 },
  {
    source: 'public/icon-maskable.svg',
    target: 'public/icon-maskable-512.png',
    width: 512,
    height: 512,
  },
  // iOS draws its own rounded corners and needs an opaque, full-bleed square.
  {
    source: 'public/icon-maskable.svg',
    target: 'public/apple-touch-icon.png',
    width: 180,
    height: 180,
  },
];

const browser = await chromium.launch();
try {
  for (const { source, target, width, height, inline } of outputs) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const svg = await readFile(source, 'utf8');
    if (inline) {
      // Inline, so the page's fonts apply to the SVG text.
      await page.setContent(
        `<!doctype html><html><head>${brandFonts}</head>` +
          `<body style="margin:0">${svg.replace('<svg ', `<svg width="${width}" height="${height}" `)}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
    } else {
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" ` +
          `width="${width}" height="${height}" style="display:block"></body></html>`,
      );
      await page.locator('img').evaluate((img) => img.decode());
    }
    await page.screenshot({ path: target, omitBackground: true });
    await page.close();
    console.log(`${target} (${width}×${height})`);
  }
} finally {
  await browser.close();
}
