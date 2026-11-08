// Theme toggle for the homepage and library pages (books keep their own).
(function () {
  function cur() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('theme-btn'); if (!b) return;
    b.addEventListener('click', function () {
      var t = cur() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('site-theme', t); } catch (e) {}
    });
  });
})();
