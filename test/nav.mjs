// Prüft SPEC.md Anforderungen 14 und 15 im echten Browser.
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
await browser.close();

if (fehler.length) {
  for (const f of fehler) console.error('FEHLER: ' + f);
  process.exit(1);
}
console.log('OK: Menü und Scroll-Spy bestanden (320 und 390 px)');
