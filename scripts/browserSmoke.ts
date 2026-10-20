// Browser smoke: open the dev server in headless Chromium with WebGPU enabled, collect
// console output and page errors, wait for the health gate, and save a screenshot.
// Usage: node scripts/browserSmoke.ts [url] [--chrome]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/?debug';
const useChrome = process.argv.includes('--chrome');
const outDir = resolve(process.cwd(), '.artifacts');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(useChrome ? { channel: 'chrome' } : {}),
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs: string[] = [];
page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.name}: ${err.message}\n${err.stack ?? ''}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`));

const started = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(6000);
const hasGpu = await page.evaluate(() => 'gpu' in navigator);
const dom = await page.evaluate(() => ({
  canvas: !!document.querySelector('canvas'),
  unsupported: document.querySelector('.eavi-unsupported')?.textContent ?? null,
  debug: document.querySelector('.eavi-debug-overlay')?.textContent ?? null,
}));
await page.screenshot({ path: resolve(outDir, 'browser-smoke.png') });
await browser.close();

console.log(JSON.stringify({ url, hasGpu, elapsedMs: Date.now() - started, dom }, null, 2));
console.log(logs.join('\n'));
