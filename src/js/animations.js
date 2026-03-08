// ── Fade-in on scroll ──────────────────────────────────────────────────────
function fadeInOnScroll() {
  const fadeEls = document.querySelectorAll('.fadein, .testimonials .card');
  const windowHeight = window.innerHeight;
  fadeEls.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < windowHeight - 60) {
      el.style.opacity = 1;
      el.style.animationPlayState = 'running';
    }
  });
}

window.addEventListener('scroll', fadeInOnScroll);
// Module scripts are deferred — DOM is ready, so call directly on load
fadeInOnScroll();
