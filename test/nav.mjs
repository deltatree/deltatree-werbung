// Prüft SPEC.md Anforderungen 14 bis 16 im echten Browser.
// Aufruf: node test/nav.mjs <basis-url>   (z. B. http://127.0.0.1:18080)
//
// check.sh sieht nur Bytes. Ob ein Menüpunkt angeschnitten ist oder der Scroll-Spy
// unterstreicht, zeigt erst ein Browser mit echter Breite.
import { chromium, devices } from 'playwright';

const BASIS = process.argv[2] || 'http://127.0.0.1:18080';
const fehler = [];
const pruefe = (ok, text) => { if (!ok) fehler.push(text); };

const browser = await chromium.launch();
for (const breite of [390, 320]) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: breite, height: 700 } });
  const seite = await ctx.newPage();
  await seite.goto(BASIS + '/', { waitUntil: 'load' });

  // Die Seite nennt ihre echte Bau-Kennung, nicht „dev" (Status-Karte und Fuß).
  const kennung = await seite.evaluate(() => ({
    meta: document.querySelector('meta[name="dt-build"]').content,
    status: document.getElementById('bh').textContent,
    fuss: document.getElementById('bf').textContent,
  }));
  pruefe(kennung.status === kennung.meta && kennung.fuss === kennung.meta && kennung.meta !== 'dev',
    `${breite}px: Bau-Kennung zeigt ${JSON.stringify(kennung)}`);

  // 3: kein seitliches Scrollen der Seite
  const seitlich = await seite.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  pruefe(!seitlich, `${breite}px: Seite scrollt seitlich`);

  // 3: Logo und Knopf halten den Seitenrand von 16 px ein
  const rand = await seite.evaluate(() => {
    const l = document.querySelector('.brand').getBoundingClientRect().left;
    const r = innerWidth - document.querySelector('.nav-cta').getBoundingClientRect().right;
    return Math.min(l, r);
  });
  pruefe(rand >= 15.5, `${breite}px: Kopfzeile hat nur ${rand}px Seitenrand`);

  // 14: bei 390 px ist kein Menüpunkt angeschnitten
  const menue = await seite.evaluate(() => {
    const leiste = document.querySelector('.nav-links');
    const r = leiste.getBoundingClientRect();
    return [...leiste.querySelectorAll('a')].map(a => {
      const b = a.getBoundingClientRect();
      return { text: a.textContent.trim(), ganz: b.left >= r.left - 0.5 && b.right <= r.right + 0.5 };
    });
  });
  pruefe(menue.length === 5, `${breite}px: ${menue.length} statt 5 Menüpunkte`);
  if (breite >= 390) {
    for (const m of menue) pruefe(m.ganz, `${breite}px: Menüpunkt „${m.text}" ist angeschnitten`);
  }

  // 15: Scroll-Spy — hinscrollen, nicht klicken
  const aktiv = () => seite.evaluate(() =>
    [...document.querySelectorAll('.nav-links a[aria-current="true"]')].map(a => a.getAttribute('href')));
  for (const [abschnitt, erwartet] of [['warum', '#warum'], ['kann', '#kann'], ['bruecke', '#bruecke'], ['faq', '#faq'], ['status', '#kontakt']]) {
    await seite.evaluate(id => {
      const el = document.getElementById(id);
      // instant: die Seite scrollt sonst weich, und der Test mäße mitten in der Bewegung.
      scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight / 3, behavior: 'instant' });
    }, abschnitt);
    await seite.waitForTimeout(400);
    const a = await aktiv();
    pruefe(a.length === 1 && a[0] === erwartet, `${breite}px: bei #${abschnitt} markiert ${JSON.stringify(a)} statt ${erwartet}`);
    // Der aktive Punkt muss sichtbar sein, auch wenn das Menü wischbar ist.
    await seite.waitForTimeout(500);
    const sichtbar = await seite.evaluate(href => {
      const a = document.querySelector(`.nav-links a[href="${href}"]`);
      const r = a.parentElement.getBoundingClientRect(), b = a.getBoundingClientRect();
      return b.left >= r.left - 1 && b.right <= r.right + 1;
    }, erwartet);
    pruefe(sichtbar, `${breite}px: aktiver Punkt ${erwartet} liegt außerhalb des Menüs`);
  }

  // Ganz oben ist nichts markiert.
  await seite.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await seite.waitForTimeout(400);
  pruefe((await aktiv()).length === 0, `${breite}px: ganz oben ist ein Punkt markiert`);

  // Unterstrich statt heller Hintergrund
  const stil = await seite.evaluate(() => {
    const a = document.querySelector('.nav-links a[href="#faq"]');
    a.setAttribute('aria-current', 'true');
    const s = getComputedStyle(a);
    return { linie: s.textDecorationLine, hintergrund: s.backgroundColor };
  });
  pruefe(stil.linie.includes('underline'), `${breite}px: aktiver Punkt ist nicht unterstrichen`);
  pruefe(stil.hintergrund === 'rgba(0, 0, 0, 0)', `${breite}px: aktiver Punkt hat Hintergrund ${stil.hintergrund}`);

  await ctx.close();
}
// Jeder Dialog lässt sich öffnen und schließen — per Knopf, Esc und Klick auf den Rand.
// Das Kontaktformular schickt ab. Kein Klick darf an der Sicherheitsregel scheitern.
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const seite = await ctx.newPage();
  await seite.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.sample || '')));
  });
  await seite.goto(BASIS + '/', { waitUntil: 'load' });
  const offen = id => seite.evaluate(i => document.getElementById(i).open, id);
  // Ein Klick, der nicht durchkommt, ist ein Befund, kein Testabbruch.
  const klick = loc => loc.click({ timeout: 2000 }).catch(() => {});
  const alleZu = () => seite.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  for (const name of ['impressum', 'agb', 'datenschutz', 'av']) {
    const id = 'm-' + name;
    for (const weg of ['knopf', 'esc', 'rand']) {
      await seite.evaluate(i => document.getElementById(i).showModal(), id);
      pruefe(await offen(id), `Dialog ${name} öffnet nicht`);
      if (weg === 'knopf') await klick(seite.locator(`#${id} .head .x`));
      if (weg === 'esc') await seite.keyboard.press('Escape');
      if (weg === 'rand') await seite.mouse.click(3, 3);
      await seite.waitForTimeout(150);
      pruefe(!(await offen(id)), `Dialog ${name} schließt nicht per ${weg}`);
      await alleZu();
    }
  }
  // Rechtstext per Link im Fuß öffnen und schließen — wie ein Besucher
  await klick(seite.locator('footer [data-modal="impressum"]').first());
  pruefe(await offen('m-impressum'), 'Impressum öffnet nicht über den Link im Fuß');
  await klick(seite.locator('#m-impressum .head .x'));
  pruefe(!(await offen('m-impressum')), 'Impressum schließt nicht');
  await alleZu();

  // Kontaktformular: Absenden läuft über das Skript (mailto). Im alten Stand blockte die
  // Sicherheitsregel den Inline-Handler UND das native Absenden (form-action 'none').
  await seite.fill('#cn', 'Test'); await seite.fill('#ce', 'test@example.org'); await seite.fill('#cm', 'Hallo');
  await seite.evaluate(() => document.querySelector('form.contact').requestSubmit());
  await seite.waitForTimeout(300);
  const csp = await seite.evaluate(() => window.__csp);
  pruefe(csp.length === 0, `Sicherheitsregel blockte: ${JSON.stringify(csp)}`);
  await ctx.close();
}

// Das Cluster-Bild im Kopf der Seite muss sichtbar sein und auf Tippen reagieren —
// auch mit „Bewegung reduzieren". Dort blieb es bis 2026-09-25 leer: das einzige Bild
// löschte der ResizeObserver gleich wieder.
for (const bewegung of ['no-preference', 'reduce']) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark', reducedMotion: bewegung });
  const seite = await ctx.newPage();
  await seite.goto(BASIS + '/', { waitUntil: 'load' });
  await seite.waitForTimeout(1200);
  const bild = () => seite.evaluate(() => {
    const c = document.getElementById('cluster');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, summe = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { n++; summe += d[i - 1] + d[i - 2] + d[i - 3]; }
    return { n, summe };
  });
  const vorher = await bild();
  pruefe(vorher.n > 10000, `Bewegung ${bewegung}: Cluster-Bild ist leer (${vorher.n} Pixel)`);
  const box = await seite.locator('#cluster').boundingBox();
  await seite.locator('#cluster').tap({ position: { x: box.width * 0.2, y: box.height * 0.8 } });
  await seite.waitForTimeout(300);
  const nachher = await bild();
  pruefe(nachher.summe !== vorher.summe, `Bewegung ${bewegung}: Tippen ins Bild ändert nichts`);
  await ctx.close();
}

await browser.close();

if (fehler.length) {
  for (const f of fehler) console.error('FEHLER: ' + f);
  process.exit(1);
}
console.log('OK: Menü, Scroll-Spy, Dialoge, Kontaktformular und Cluster-Bild bestanden (320/390 px, mit und ohne reduzierte Bewegung)');
