// Farbschema: Dunkel ist Standard. Der Umschalter wechselt Dunkel → Hell → Automatisch (wie das System).
// Läuft im <head> ohne defer, damit die Seite nicht kurz in der falschen Farbe aufblitzt.
(function () {
  var KEY = "dt-farbschema";
  var ORDER = ["dark", "light", "auto"];
  var NAMES = { dark: "Dunkel", light: "Hell", auto: "Automatisch" };
  var ICONS = { dark: "☾", light: "☀", auto: "◐" };
  var root = document.documentElement;
  var theme = "dark";
  try {
    var saved = localStorage.getItem(KEY);
    if (ORDER.indexOf(saved) >= 0) theme = saved;
  } catch (e) { /* ohne Speicher bleibt es bei Dunkel */ }
  root.setAttribute("data-theme", theme);

  function show(button, t) {
    button.setAttribute("aria-label", "Farbschema: " + NAMES[t] + ". Klicken zum Wechseln");
    button.title = "Farbschema: " + NAMES[t];
    var icon = button.querySelector(".tt-i");
    if (icon) icon.textContent = ICONS[t];
  }

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector(".theme-toggle");
    if (!button) return;
    show(button, root.getAttribute("data-theme"));
    button.addEventListener("click", function () {
      var next = ORDER[(ORDER.indexOf(root.getAttribute("data-theme")) + 1) % ORDER.length];
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* Wahl gilt dann nur bis zum Neuladen */ }
      show(button, next);
    });
  });
})();
