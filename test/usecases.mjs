// Prüft /usecases und /usecases/website-mit-ki (SPEC 26) im echten Browser mit der echten Sicherheitsregel.
// Aufruf: node test/usecases.mjs <basis-url>
import { chromium } from 'playwright';

const BASIS = process.argv[2] || 'http://127.0.0.1:18080';
const fehler = [];
const pruefe = (ok, text) => { if (!ok) fehler.push(text); };
const browser = await chromium.launch();

for (const pfad of ['/usecases', '/usecases/website-mit-ki', '/usecases/digitale-visitenkarte']) {
  for (const breite of [320, 390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, isMobile: breite < 768, hasTouch: breite < 768 });
    const seite = await ctx.newPage();
    const meldungen = [];
    seite.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) meldungen.push(m.text()); });
    seite.on('pageerror', e => meldungen.push('Skriptfehler: ' + e.message));
    await seite.goto(BASIS + pfad, { waitUntil: 'load' });
    await seite.evaluate(async () => { for (const img of document.images) img.loading = 'eager'; window.scrollTo(0, document.body.scrollHeight); });
    await seite.waitForLoadState('networkidle');
    pruefe(meldungen.length === 0, `${pfad} ${breite}px: ${meldungen.join(' | ')}`);
    pruefe(!(await seite.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${pfad} ${breite}px: Seite scrollt seitlich`);
    const kaputt = await seite.evaluate(() => [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src));
    pruefe(kaputt.length === 0, `${pfad} ${breite}px: Bilder laden nicht: ${kaputt.join(', ')}`);
    pruefe(await seite.locator('h1').count() === 1, `${pfad} ${breite}px: nicht genau eine H1`);
    if (breite === 390) { // Betreiber 2026-11-17: Anrede „du“, kein IHK-Hinweis
      const text = await seite.locator('main').innerText();
      const sie = text.match(/\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/g) || [];
      pruefe(!/IHK/.test(text), `${pfad}: IHK-Hinweis auf der Seite`);
      pruefe(sie.length === 0 || sie.every(w => w === 'Sie'), `${pfad}: förmliche Anrede ${sie.join(', ')}`);
    }
    await ctx.close();
  }
}

// Anleitung: aufklappen und Prompt kopieren
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const seite = await ctx.newPage();
await seite.goto(BASIS + '/usecases/website-mit-ki', { waitUntil: 'load' });
await seite.locator('summary', { hasText: 'Prompt für deinen Coding Assistant' }).click();
await seite.locator('#kopieren').click();
await seite.waitForTimeout(300);
pruefe((await seite.locator('#toast').textContent()).includes('kopiert'), 'Prompt: kein „kopiert“-Hinweis');
if (BASIS.startsWith('https://')) { // Clipboard-API nur im sicheren Kontext lesbar
  const kopiert = await seite.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  pruefe(kopiert.includes('dtadmin-ai-access.md') && kopiert.includes('Decap CMS'), `Prompt nicht in der Zwischenablage: ${kopiert.slice(0, 60)}`);
}
await ctx.close();

// Visitenkarte: Prompt kopierbar
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const s2 = await ctx2.newPage();
await s2.goto(BASIS + '/usecases/digitale-visitenkarte', { waitUntil: 'load' });
await s2.locator('summary', { hasText: 'Prompt für deinen Coding Assistant' }).click();
await s2.locator('#kopieren').click();
await s2.waitForTimeout(300);
pruefe((await s2.locator('#toast').textContent()).includes('kopiert'), 'Visitenkarte-Prompt: kein „kopiert“-Hinweis');
await ctx2.close();

await browser.close();
if (fehler.length) { console.error('FEHLER Anwendungsfälle:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('OK: Anwendungsfälle im Browser (320, 390, 768, 1440 px), Prompt kopierbar');
