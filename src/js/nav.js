// ── Mobile menu toggle & dropdown support ──────────────────────────────────
(function () {
  const btn = document.querySelector('.menu-toggle');
  const nav = document.getElementById('navMenu');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  // Close menu when a link is tapped
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }));

  // Enable dropdown open on tap for mobile
  const dd = nav.querySelector('.dropdown');
  if (dd) {
    const trigger = dd.querySelector('.drop-trigger');
    if (trigger) {
      trigger.addEventListener('click', e => {
        if (window.matchMedia('(max-width: 768px)').matches) {
          e.preventDefault();
          dd.classList.toggle('open');
        }
      });
    }
  }
})();
