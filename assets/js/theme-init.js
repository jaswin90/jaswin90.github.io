// Apply the reader's light/dark choice before the page paints. One key for the whole site.
(function () {
  try {
    var t = localStorage.getItem('site-theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system setting */ }
})();
