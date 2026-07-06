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

  // Hero: multiple photos, auto-rotating crossfade
  const heroPhotoLayer = document.querySelector('.hero-photo-layer');
  const heroEmptyLabel = document.querySelector('.hero-empty-label');
  let heroPhotos = [];
  let heroCurrent = 0;
  let heroTimer = null;

  function showHeroPhoto(index) {
    heroPhotoLayer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'hero-photo';
    div.style.backgroundImage = `url("${heroPhotos[index].url}")`;
    heroPhotoLayer.appendChild(div);
    requestAnimationFrame(() => div.classList.add('visible'));
  }

  function startHeroRotation() {
    if (heroTimer) clearInterval(heroTimer);
    if (heroPhotos.length <= 1) return;
    heroTimer = setInterval(() => {
      heroCurrent = (heroCurrent + 1) % heroPhotos.length;
      showHeroPhoto(heroCurrent);
    }, 5000);
  }

  fetch('/api/photos?slot=hero')
    .then((r) => r.json())
    .then((data) => {
      heroPhotos = data.photos || [];
      if (heroPhotos.length > 0) {
        heroEmptyLabel.style.display = 'none';
        showHeroPhoto(0);
        startHeroRotation();
      }
    })
    .catch(() => {});

  // Category banners: single latest photo per slot
  document.querySelectorAll('.category-banner').forEach((banner) => {
    const slot = banner.dataset.slot;
    const photoLayer = banner.querySelector('.category-photo-layer');
    const emptyLabel = banner.querySelector('.category-empty-label');

    fetch(`/api/photos?slot=${encodeURIComponent(slot)}`)
      .then((r) => r.json())
      .then((data) => {
        const photos = data.photos || [];
        if (photos.length === 0) return;
        emptyLabel.style.display = 'none';
        const div = document.createElement('div');
        div.className = 'category-photo';
        div.style.backgroundImage = `url("${photos[0].url}")`;
        photoLayer.appendChild(div);
        requestAnimationFrame(() => div.classList.add('visible'));
      })
      .catch(() => {});
  });
})();
