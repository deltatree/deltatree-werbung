/* Gemeinsames Verhalten aller Seiten. Abgeleitet aus dem Skript von deltatree.de. */
(() => {
  "use strict";

  const yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  // Inhalte beim Scrollen einblenden.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // Rechtstexte als Dialog, auch über #impressum, #agb, #datenschutz, #av.
  const legal = ["impressum", "agb", "datenschutz", "av"];
  const open = (id) => document.getElementById("m-" + id)?.showModal();
  document.querySelectorAll("[data-modal]").forEach((b) => b.addEventListener("click", () => open(b.dataset.modal)));
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    if (legal.includes(id)) a.addEventListener("click", (ev) => { ev.preventDefault(); open(id); });
  });
  if (legal.includes(location.hash.slice(1))) open(location.hash.slice(1));
  document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (ev) => {
    if (ev.target !== d) return;
    const r = d.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close();
  }));

  // Kontaktformular öffnet nur das Mail-Programm.
  document.getElementById("contact-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = document.getElementById("cn").value.trim();
    const mail = document.getElementById("ce").value.trim();
    const msg = document.getElementById("cm").value.trim();
    const subject = encodeURIComponent("Anfrage über deltatree.de · " + name);
    const body = encodeURIComponent(`Name: ${name}\nE-Mail: ${mail}\n\n${msg}`);
    location.href = `mailto:info@deltatree.de?subject=${subject}&body=${body}`;
  });

  // Prompts kopieren.
  document.querySelectorAll("button[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const pre = document.getElementById(b.dataset.copy);
    if (!pre) return;
    try {
      await navigator.clipboard.writeText(pre.textContent.trim());
      b.textContent = "Kopiert";
    } catch {
      const r = document.createRange();
      r.selectNodeContents(pre);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      b.textContent = "Markiert – jetzt kopieren";
    }
    setTimeout(() => { b.textContent = "Kopieren"; }, 2500);
  }));

  // Live-Status, nur wenn die Seite den Block enthält.
  if (!document.getElementById("row-app")) return;
  const pill = (id, state, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = "pill " + (state === "up" ? "up" : state === "down" ? "down" : "checking");
    el.textContent = label;
  };
  const probe = async (url, id) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: ctrl.signal });
      pill(id, "up", "erreichbar");
    } catch {
      pill(id, "down", "nicht erreichbar");
    } finally {
      clearTimeout(timer);
    }
  };
  const check = async () => {
    pill("row-app", "check", "prüfe…");
    pill("row-api", "check", "prüfe…");
    await Promise.all([
      probe("https://dtadmin-frontend.capps.dtcloud.de/", "row-app"),
      probe("https://dtadmin-backend.capps.dtcloud.de/health", "row-api"),
    ]);
    const hc = document.getElementById("hc");
    if (hc) hc.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  check();
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
})();
