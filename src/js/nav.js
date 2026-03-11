// ── Sticky nav + mobile hamburger + scroll fade-ins ──────────────────────
const nav       = document.getElementById('siteNav');
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');

// Add .scrolled class once user scrolls past the fold
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// Start scrolled if page is loaded mid-scroll
if (window.scrollY > 60) nav.classList.add('scrolled');

// Hamburger open/close
if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
    mobileNav.setAttribute('aria-hidden', String(!isOpen));
  });

  // Close drawer on link tap
  mobileNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
    });
  });
}

// Scroll-triggered fade-ins
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.fadein').forEach(el => observer.observe(el));

// ── Hero frame shrink on scroll ────────────────────────────────────────────
const heroScrollZone = document.querySelector('.hero-scroll-zone');
const heroFrame      = document.querySelector('.hero-frame');

if (heroScrollZone && heroFrame) {
  const updateHeroFrame = () => {
    const scrollRange = heroScrollZone.offsetHeight - window.innerHeight;
    const progress    = Math.min(1, Math.max(0, window.scrollY / scrollRange));
    const maxInset = Math.min(window.innerWidth, window.innerHeight) * 0.20;
    const inset    = progress * maxInset;
    heroFrame.style.inset = `${inset}px`;
  };
  window.addEventListener('scroll', updateHeroFrame, { passive: true });
  updateHeroFrame();
}

