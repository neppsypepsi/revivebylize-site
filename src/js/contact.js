// ── Contact form handler ───────────────────────────────────────────────────
const contactForm = document.getElementById('contactForm');
const formMsg     = document.getElementById('formMsg');

if (contactForm) {
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = contactForm.querySelector('.form-submit');
    btn.textContent = 'Sending…';
    btn.disabled = true;

    const data = Object.fromEntries(new FormData(contactForm));
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        formMsg.textContent = "Request received — we'll be in touch shortly.";
        contactForm.reset();
      } else {
        formMsg.textContent = 'Something went wrong. Please email us directly.';
      }
    } catch {
      formMsg.textContent = 'Could not send. Please email contact@revivebylize.com';
    }
    btn.textContent = 'Confirm Request';
    btn.disabled = false;
  });
}

// ── Parallax zoom-out on scroll ───────────────────────────────────────────
const parallaxImg = document.querySelector('.parallax-zoom');
if (parallaxImg) {
  const updateParallax = () => {
    const rect     = parallaxImg.parentElement.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, 1 - rect.top / window.innerHeight));
    parallaxImg.style.transform = `scale(${1.18 - 0.18 * progress})`;
  };
  window.addEventListener('scroll', updateParallax, { passive: true });
  updateParallax();
}
