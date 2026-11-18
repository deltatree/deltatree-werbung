// Prüft /usecases und /usecases/website-mit-ki (SPEC 26) im echten Browser mit der echten Sicherheitsregel.
// Aufruf: node test/usecases.mjs <basis-url>
import { chromium } from 'playwright';

const BASIS = process.argv[2] || 'http://127.0.0.1:18080';
const fehler = [];
const pruefe = (ok, text) => { if (!ok) fehler.push(text); };
const browser = await chromium.launch();

for (const pfad of ['/usecases', '/usecases/website-mit-ki', '/usecases/digitale-visitenkarte']) {
  for (const breite of [320, 390, 768, 1440, 1920]) {
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
    if (breite >= 1440) { // Betreiber 2026-11-17: am Desktop die ganze Breite nutzen
      const anteil = await seite.evaluate(() => document.querySelector('main').getBoundingClientRect().width / innerWidth);
      pruefe(anteil >= 0.85, `${pfad} ${breite}px: Inhalt nutzt nur ${Math.round(anteil * 100)} % der Breite`);
    }
    if (breite === 390) { // Betreiber 2026-11-17: Anrede „du“, kein IHK-Hinweis
      const text = await seite.locator('main').innerText();
      const sie = text.match(/\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/g) || [];
      pruefe(!/IHK/.test(text), `${pfad}: IHK-Hinweis auf der Seite`);
      pruefe(sie.length === 0 || sie.every(w => w === 'Sie'), `${pfad}: förmliche Anrede ${sie.join(', ')}`);
    }
    await ctx.close();
  }
}

// Anleitung: jeder Prompt hat einen eigenen Kopierknopf (Echttest 2026-11-18: Werkstatt, Website, Design, Karte)
const ERWARTET = { '/usecases/website-mit-ki': ['prompt', 'prompt-website', 'prompt-design'], '/usecases/digitale-visitenkarte': ['prompt', 'prompt-karte'] };
for (const [pfad, ziele] of Object.entries(ERWARTET)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const seite = await ctx.newPage();
  await seite.goto(BASIS + pfad, { waitUntil: 'load' });
  const html = await seite.content();
  pruefe(!html.includes('config.yml'), `${pfad}: nennt config.yml (die WAF sperrt die Datei mit 403)`);
  for (const d of await seite.locator('#selbst details').all()) await d.evaluate(e => { e.open = true; });
  pruefe(await seite.locator('button.kopieren').count() === ziele.length, `${pfad}: ${ziele.length} Kopierknöpfe erwartet`);
  for (const ziel of ziele) {
    const knopf = seite.locator(`button.kopieren[data-ziel="${ziel}"]`);
    if (await knopf.count() !== 1) { pruefe(false, `${pfad}: Kopierknopf für ${ziel} fehlt`); continue; }
    await knopf.click();
    await seite.waitForTimeout(300);
    pruefe((await seite.locator('#toast').textContent()).includes('kopiert'), `${pfad} ${ziel}: kein „kopiert“-Hinweis`);
    if (BASIS.startsWith('https://')) { // Clipboard-API nur im sicheren Kontext lesbar
      const kopiert = await seite.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      const soll = (await seite.locator('#' + ziel).textContent()).trim();
      pruefe(kopiert.trim() === soll, `${pfad} ${ziel}: Zwischenablage ≠ Prompt (${kopiert.slice(0, 40)})`);
    }
  }
  pruefe(((await seite.locator('#prompt').textContent().catch(() => '')) || '').includes('dtadmin-ai-access.md'), `${pfad}: Prompt 1 nennt die KI-Anleitung nicht`);
  // Ein Geheimnis gehört nie in den Chat: Der Prompt verweist auf die Datei, die der Mensch angelegt hat.
  for (const ziel of ziele) {
    const text = ((await seite.locator('#' + ziel).textContent().catch(() => '')) || '');
    pruefe(!/<dein token>|zugangstoken:\s*</i.test(text), `${pfad} ${ziel}: Prompt verlangt das Token im Chat-Text`);
    if (/token/i.test(text)) pruefe(text.includes('forgejo-token.txt'), `${pfad} ${ziel}: Prompt nennt die Token-Datei forgejo-token.txt nicht`);
  }
  await ctx.close();
}

await browser.close();
if (fehler.length) { console.error('FEHLER Anwendungsfälle:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('OK: Anwendungsfälle im Browser (320, 390, 768, 1440, 1920 px), Prompt kopierbar');
