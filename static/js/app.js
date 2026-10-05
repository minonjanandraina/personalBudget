/* Animations et petits comportements — JavaScript vanilla */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Apparition échelonnée des éléments .reveal
  function revealAll(root) {
    var items = (root || document).querySelectorAll(".reveal:not(.in)");
    items.forEach(function (el, i) {
      if (reduceMotion) { el.classList.add("in"); return; }
      setTimeout(function () { el.classList.add("in"); }, 60 * i);
    });
  }

  // Compteur animé pour les montants : <span data-countup="125000">
  function formatAr(n) {
    return Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ") + " Ar";
  }
  function countUp(el) {
    var target = parseInt(el.dataset.countup, 10);
    if (isNaN(target)) return;
    if (reduceMotion) { el.textContent = formatAr(target); return; }
    var start = null, duration = 800;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.textContent = formatAr(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function runCountUps(root) {
    (root || document).querySelectorAll("[data-countup]").forEach(countUp);
  }

  // Retour haptique léger sur les éléments tactiles (si supporté)
  document.addEventListener("click", function (e) {
    if (e.target.closest(".tile, .tabbar a, .btn-app") && navigator.vibrate) {
      navigator.vibrate(8);
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    revealAll();
    runCountUps();
  });
  // Fragments HTMX insérés dynamiquement
  document.addEventListener("htmx:afterSwap", function (e) {
    revealAll(e.target);
    runCountUps(e.target);
  });
})();
