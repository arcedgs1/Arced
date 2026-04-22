'use strict';

const nav = document.getElementById('nav');
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileClose = document.getElementById('mobileClose');

// Sticky nav on scroll
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// Mobile menu open/close
function openMenu() {
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeMenu() {
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
}

hamburger.addEventListener('click', openMenu);
mobileClose.addEventListener('click', closeMenu);

mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    });
});

// Fade-in on scroll
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.service-card, .stat, .about__content, .about__card, .contact__item').forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
});

// Contact form — visual feedback
const form = document.getElementById('contactForm');
if (form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const original = btn.textContent;

        btn.textContent = 'Message Sent!';
        btn.style.cssText = 'background:#2a6e47;border-color:#2a6e47;color:#fff;cursor:default;';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = original;
            btn.style.cssText = '';
            btn.disabled = false;
            form.reset();
        }, 3500);
    });
}
