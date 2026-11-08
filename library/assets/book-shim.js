// Loaded by every book page inside the library, right after the book's own book.js.
// It keeps the book's progress sync (the book's auth.js still runs), but moves the
// sign-in UI to the library: book pages only show who is signed in and a link back.
(function () {
  var me = document.currentScript;
  var LIB = (me && me.getAttribute('data-library')) || '/library/';
  var FIELD = (me && me.getAttribute('data-field')) || LIB;
  var FIELD_TITLE = (me && me.getAttribute('data-field-title')) || 'Library';
  var here = location.pathname + location.search + location.hash;
  var signInUrl = LIB + '?signin=1&next=' + encodeURIComponent(here);
  function go() { location.href = signInUrl; }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); };

  // Any call to BookAuth.signIn() in a book now goes to the library's sign-in page.
  var store;
  try {
    Object.defineProperty(window, 'BookAuth', {
      configurable: true,
      get: function () { return store; },
      set: function (v) {
        store = v;
        try { Object.defineProperty(v, 'signIn', { configurable: true, enumerable: true, get: function () { return go; }, set: function () {} }); } catch (e) {}
      }
    });
  } catch (e) {}

  function slotHtml(user, syncing) {
    if (!user) return '<button class="btn" id="auth-btn" type="button" title="Sign in at the library to keep your progress on every device">Sign in</button>';
    var name = (user.displayName || user.email || 'Reader').split(' ')[0];
    return '<span class="user-chip">' + (user.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(user.photoURL) + '">' : '') +
      '<span class="sync-dot ' + (syncing ? 'on' : '') + '" title="' + (syncing ? 'Progress synced to your account' : 'Syncing…') + '"></span>' +
      '<a class="small" href="' + esc(LIB) + '" title="Account and sign-out are in the library">' + esc(name) + '</a></span>';
  }

  function patch() {
    var B = window.Book; if (!B) return;
    B.renderAuth = function (user, syncing) {
      var slot = document.getElementById('auth-slot'); if (!slot) return;
      slot.innerHTML = slotHtml(user, syncing);
      var btn = slot.querySelector('#auth-btn'); if (btn) btn.addEventListener('click', go);
    };
    var slot = document.getElementById('auth-slot');
    if (slot && !slot.querySelector('.user-chip')) B.renderAuth(null);
    var nav = document.querySelector('.topbar nav');
    if (nav && !nav.querySelector('.lib-link')) {
      var a = document.createElement('a'); a.className = 'lib-link'; a.href = FIELD; a.textContent = FIELD_TITLE;
      var l = document.createElement('a'); l.className = 'lib-link'; l.href = LIB; l.textContent = 'Library';
      nav.insertBefore(a, nav.firstChild); nav.insertBefore(l, nav.firstChild);
    }
    // A breadcrumb at the top of the page, visible on every screen size (the nav is hidden on phones).
    var host = document.querySelector('.cover') || document.querySelector('article');
    if (host && !document.querySelector('.lib-crumbs')) {
      var brand = document.querySelector('.topbar .brand');
      var c = document.createElement('p'); c.className = 'lib-crumbs';
      c.style.cssText = 'font-family:var(--sans);font-size:.8rem;color:var(--muted);margin:0 0 .6rem';
      c.innerHTML = '<a href="' + esc(LIB) + '">Library</a> › <a href="' + esc(FIELD) + '">' + esc(FIELD_TITLE) + '</a>' +
        (brand ? ' › <a href="' + esc(brand.getAttribute('href')) + '">' + esc(brand.textContent) + '</a>' : '');
      host.insertBefore(c, host.firstChild);
    }
  }
  if (window.Book && document.querySelector('.topbar')) patch();
  document.addEventListener('book:ready', patch);
  document.addEventListener('DOMContentLoaded', function () { setTimeout(patch, 0); });
})();
