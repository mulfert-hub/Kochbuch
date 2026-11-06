// Lädt Playwright – lokal installiert oder global (z. B. vorinstalliert in CI/Container).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  const root = execSync('npm root -g').toString().trim();
  pw = require(`${root}/playwright`);
}
export const { chromium } = pw;
