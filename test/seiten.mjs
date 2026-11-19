// Prüft alle Seiten (seit 2026-11-19) im echten Browser mit der echten Sicherheitsregel.
// Aufruf: node test/seiten.mjs <basis-url>
import { chromium } from 'playwright';

const BASIS = process.argv[2] || 'http://127.0.0.1:18080';
const SEITEN = ['/', '/entwickler/', '/plattform/', '/website-mit-ki/', '/website-mit-ki/website/',
  '/website-mit-ki/visitenkarte/', '/preise/', '/wechsel/'];
const ANLEITUNGEN = ['/website-mit-ki/website/', '/website-mit-ki/visitenkarte/'];
const fehler = [];
const pruefe = (ok, text) => { if (!ok) fehler.push(text); };
const browser = await chromium.launch();

for (const pfad of SEITEN) {
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
      const sie = text.match(/\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/g) || [];
      pruefe(!/IHK/.test(text), `${pfad}: IHK-Hinweis auf der Seite`);
      pruefe(sie.length === 0, `${pfad}: förmliche Anrede ${sie.join(', ')}`);
    }
    await ctx.close();
  }
}

// Anleitungen: Jeder Prompt hat einen Kopierknopf; der Mensch braucht kein Git und kein JSON.
for (const pfad of ANLEITUNGEN) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const seite = await ctx.newPage();
  await seite.goto(BASIS + pfad, { waitUntil: 'load' });
  for (const d of await seite.locator('details').all()) await d.evaluate(e => { e.open = true; });
  const sichtbar = await seite.locator('main').innerText();
  pruefe(!/zusammenführen|pull-request/i.test(sichtbar), `${pfad}: Seite verlangt Git-Wissen (Pull-Request/Zusammenführen)`);
  pruefe(!/committen|\.json\b/i.test(sichtbar.replace(/forgejo-token\.txt/g, '')), `${pfad}: Seite verlangt JSON oder „committen“`);
  pruefe(!(await seite.content()).includes('config.yml'), `${pfad}: nennt config.yml (die WAF sperrt die Datei mit 403)`);
  const prompts = await seite.locator('pre.prompt').all();
  pruefe(prompts.length >= 2, `${pfad}: weniger als zwei Prompts`);
  pruefe(await seite.locator('button[data-copy]').count() === prompts.length, `${pfad}: nicht jeder Prompt hat einen Kopierknopf`);
  const texte = [];
  for (const pre of prompts) texte.push(((await pre.textContent()) || '').trim());
  pruefe(texte.some(t => t.includes('dtadmin-ai-access.md')), `${pfad}: kein Prompt nennt die KI-Anleitung`);
  for (const [i, t] of texte.entries()) {
    pruefe(!/<dein token>|zugangstoken:\s*</i.test(t), `${pfad} Prompt ${i + 1}: verlangt das Token im Chat-Text`);
    if (/token/i.test(t)) pruefe(t.includes('forgejo-token.txt'), `${pfad} Prompt ${i + 1}: nennt die Token-Datei forgejo-token.txt nicht`);
    pruefe(!/pull-request|zusammenf/i.test(t), `${pfad} Prompt ${i + 1}: verlangt eine Freigabe in Git`);
  }
  for (const knopf of await seite.locator('button[data-copy]').all()) {
    await knopf.click();
    await seite.waitForTimeout(200);
    pruefe(/Kopiert|Markiert/.test(await knopf.textContent()), `${pfad} ${await knopf.getAttribute('data-copy')}: keine Rückmeldung beim Kopieren`);
    if (BASIS.startsWith('https://')) { // Clipboard-API nur im sicheren Kontext lesbar
      const kopiert = await seite.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      const soll = ((await seite.locator('#' + await knopf.getAttribute('data-copy')).textContent()) || '').trim();
      pruefe(kopiert.trim() === soll, `${pfad}: Zwischenablage ≠ Prompt (${kopiert.slice(0, 40)})`);
    }
  }
  await ctx.close();
}

await browser.close();
if (fehler.length) { console.error('FEHLER:\n' + fehler.join('\n')); process.exit(1); }
console.log(`OK: ${SEITEN.length} Seiten im Browser (320, 390, 768, 1440 px), Prompts kopierbar`);
