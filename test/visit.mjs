// Prüft die Visitenkarte /visit (SPEC 17–21) im echten Browser, mit der echten Sicherheitsregel.
// Aufruf: node test/visit.mjs <basis-url>
import { chromium, devices } from 'playwright';

const BASIS = process.argv[2] || 'http://127.0.0.1:18080';
const fehler = [];
const pruefe = (ok, text) => { if (!ok) fehler.push(text); };

const browser = await chromium.launch();
for (const breite of [390, 320]) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: breite, height: 760 }, acceptDownloads: true });
  const seite = await ctx.newPage();
  const csp = [];
  seite.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) csp.push(m.text()); });
  seite.on('pageerror', e => csp.push('Skriptfehler: ' + e.message));
  await seite.goto(BASIS + '/visit', { waitUntil: 'networkidle' });

  pruefe(await seite.locator('img.avatar').evaluate(i => i.complete && i.naturalWidth === 400), `${breite}px: Foto lädt nicht`);
  pruefe(csp.length === 0, `${breite}px: CSP/Skript meldet ${csp.join(' | ')}`);
  pruefe(!(await seite.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${breite}px: Seite scrollt seitlich`);
  pruefe((await seite.locator('h1').textContent()).trim() === 'Alexander Widak', `${breite}px: Name fehlt`);
  pruefe(await seite.locator('.qr img').evaluate(i => i.complete && i.naturalWidth > 0), `${breite}px: QR-Bild lädt nicht`);

  // Zero-Configuration: Formular aus den Seitendaten vorbelegt.
  pruefe(await seite.inputValue('input[name="email"]') === 'info@deltatree.de', `${breite}px: Formular nicht vorbelegt`);

  // vCard: Standard und personalisiert.
  let dl = await Promise.all([seite.waitForEvent('download'), seite.click('#save')]).then(r => r[0]);
  let roh = await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8'));
  pruefe(roh.split('\r\n').every(l => Buffer.byteLength(l) <= 75), `${breite}px: vCard-Zeile über 75 Bytes`);
  let text = roh.replace(/\r\n /g, ''); // gefaltete Zeilen für die Prüfung zusammensetzen
  pruefe(dl.suggestedFilename() === 'alexander-widak.vcf', `${breite}px: Dateiname ${dl.suggestedFilename()}`);
  pruefe(/^BEGIN:VCARD\r\nVERSION:3.0\r\n/.test(text) && /FN:Alexander Widak\r\n/.test(text) && /EMAIL;TYPE=INTERNET,WORK:info@deltatree.de/.test(text),
    `${breite}px: vCard unvollständig: ${JSON.stringify(text)}`);
  pruefe(text.includes('https://deltatree.de/visit'), `${breite}px: vCard ohne feste Adresse`);
  pruefe(/\r\nPHOTO;ENCODING=b;TYPE=JPEG:\/9j\//.test(text), `${breite}px: vCard ohne Foto`);

  await seite.click('#edit summary');
  await seite.fill('input[name="telephone"]', '+49 170 1234567');
  await seite.fill('textarea[name="note"]', 'Messe; Stand 4, Halle B');
  dl = await Promise.all([seite.waitForEvent('download'), seite.click('#vform button[type="submit"]')]).then(r => r[0]);
  text = await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8')).then(t => t.replace(/\r\n /g, ''));
  pruefe(text.includes('TEL;TYPE=WORK,VOICE:+49 170 1234567'), `${breite}px: Telefon fehlt in personalisierter vCard`);
  pruefe(text.includes('NOTE:Messe\\; Stand 4\\, Halle B · https://deltatree.de/visit'), `${breite}px: Notiz falsch maskiert: ${JSON.stringify(text.split('\r\n').find(l => l.startsWith('NOTE')))}`);
  pruefe(/^\/visit\/qr\.svg\?v=[0-9a-f]{10}$/.test(await seite.locator('.qr img').getAttribute('src')), `${breite}px: QR-Ziel verändert`);

  // Teilen: Web Share API mit fester Adresse.
  await seite.evaluate(() => { window.__geteilt = null; navigator.share = async d => { window.__geteilt = d; }; });
  await seite.click('#share');
  const geteilt = await seite.evaluate(() => window.__geteilt);
  pruefe(geteilt && geteilt.url === 'https://deltatree.de/visit', `${breite}px: Teilen nutzt ${JSON.stringify(geteilt)}`);

  // iPhone ohne Home-Bildschirm: Hinweis sichtbar.
  pruefe(await seite.locator('#ios-hint').isVisible(), `${breite}px: Hinweis „Zum Home-Bildschirm“ fehlt auf dem iPhone`);
  await ctx.close();
}
// Alle Bildschirmgrößen: kein seitliches Scrollen, Knöpfe einzeilig; ab 1000 px zwei Spalten.
for (const [breite, hoehe] of [[768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  const seite = await ctx.newPage();
  await seite.goto(BASIS + '/visit', { waitUntil: 'load' });
  const m = await seite.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const knoepfe = [...document.querySelectorAll('.actions .btn')].map(b => b.getBoundingClientRect().height);
    const feat = [...document.querySelectorAll('.feat li')].map(li => Math.round(li.getBoundingClientRect().top));
    return { seitlich: document.documentElement.scrollWidth > innerWidth, a: r('.col-a'), b: r('.col-b'),
      knopfMax: Math.max(...knoepfe), vor: r('input[name="givenName"]'), nach: r('input[name="familyName"]'),
      reihen: [...new Set(feat)].map(t => feat.filter(x => x === t).length) };
  });
  pruefe(!m.seitlich, `${breite}px: Seite scrollt seitlich`);
  pruefe(m.knopfMax < 60, `${breite}px: Knopf bricht um (Höhe ${m.knopfMax})`);
  pruefe(new Set(m.reihen).size === 1, `${breite}px: Funktionskacheln mit Lücke ${JSON.stringify(m.reihen)}`);
  if (breite >= 1000) {
    pruefe(m.b.left >= m.a.right && Math.abs(m.b.top - m.a.top) < 2, `${breite}px: keine zwei Spalten`);
    pruefe(Math.abs(m.vor.top - m.nach.top) < 2 && m.vor.width > 100, `${breite}px: Vor- und Nachname nicht nebeneinander`);
    pruefe(await seite.evaluate(() => document.getElementById('edit').open), `${breite}px: Anpassen nicht aufgeklappt`);
  }
  await ctx.close();
}
await browser.close();
if (fehler.length) { console.error('FEHLER Visitenkarte:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('OK: Visitenkarte im Browser (320, 390, 768, 1024, 1440, 1920 px)');
