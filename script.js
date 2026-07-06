(function () {
  const header = document.querySelector('.site-header');
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuBtn = document.querySelector('.menu-btn');
  const mobileNav = document.querySelector('.mobile-nav');
  menuBtn.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
  });

  const hero = document.querySelector('.hero');
  const spotlight = document.querySelector('.hero-spotlight');
  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    spotlight.style.background = `radial-gradient(480px circle at ${x}% ${y}%, rgba(255,212,0,.16), transparent 65%)`;
  });

  const heroPhotoLayer = document.querySelector('.hero-photo-layer');
  const heroEmptyLabel = document.querySelector('.hero-empty-label');

  let photos = [];
  let current = 0;
  let rotateTimer = null;

  function showPhoto(index) {
    heroPhotoLayer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'hero-photo';
    div.style.backgroundImage = `url("${photos[index].url}")`;
    heroPhotoLayer.appendChild(div);
    requestAnimationFrame(() => div.classList.add('visible'));
  }

  function startRotation() {
    if (rotateTimer) clearInterval(rotateTimer);
    if (photos.length <= 1) return;
    rotateTimer = setInterval(() => {
      current = (current + 1) % photos.length;
      showPhoto(current);
    }, 5000);
  }

  fetch('/api/photos')
    .then((r) => r.json())
    .then((data) => {
      photos = data.photos || [];
      if (photos.length > 0) {
        heroEmptyLabel.style.display = 'none';
        showPhoto(0);
        startRotation();
      }
    })
    .catch(() => {});
})();
