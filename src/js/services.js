// ── Services tabs ──────────────────────────────────────────────────────────
(function () {
  const tabs          = Array.from(document.querySelectorAll('.services-tabs .tab'));
  const panelSignature = document.getElementById('panel-signature');
  const panelRecovery  = document.getElementById('panel-recovery');
  const panels         = [panelSignature, panelRecovery];

  function scrollToServices() {
    const sec = document.getElementById('services');
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
  }

  function handleHash() {
    const h = (location.hash || '').toLowerCase();
    if (h.includes('services/recovery')) { activate(1); scrollToServices(); }
    else if (h.includes('services'))     { activate(0); scrollToServices(); }
  }

  function activate(idx) {
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === idx)));
    panels.forEach((p, i) => {
      if (i === idx) {
        p.classList.add('active');
        p.removeAttribute('hidden');
      } else {
        p.classList.remove('active');
        p.setAttribute('hidden', '');
      }
    });
  }

  // Show Signature by default
  activate(0);

  tabs[0].addEventListener('click', () => activate(0));
  tabs[1].addEventListener('click', () => activate(1));

  // Keyboard arrow navigation
  tabs.forEach((t, i) => t.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') tabs[(i+1) % tabs.length].focus();
    if (e.key === 'ArrowLeft')  tabs[(i-1+tabs.length) % tabs.length].focus();
  }));

  // Deep-link: #services/recovery opens Recovery panel
  if (location.hash && location.hash.toLowerCase().includes('recovery')) activate(1);

  window.addEventListener('hashchange', handleHash);

  document.querySelectorAll('a[href*="#services/recovery"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      location.hash = '#services/recovery';
      handleHash();
    });
  });
})();
