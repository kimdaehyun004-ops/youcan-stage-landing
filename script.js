(function () {
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

  // Category banners: single latest photo per slot, plus their product grid
  const PRODUCTS = window.PRODUCTS || [];

  function productCardHTML(product) {
    return `
      <a class="product-card" href="/product.html?id=${encodeURIComponent(product.id)}">
        <div class="product-card-photo" data-product-photo="${product.id}">
          <span class="ph-label">PRODUCT</span>
        </div>
        <div class="product-card-body">
          <p class="product-card-name">${product.name}</p>
        </div>
      </a>`;
  }

  document.querySelectorAll('.category-banner').forEach((banner) => {
    const slot = banner.dataset.slot;
    const category = banner.dataset.category;
    const photoLayer = banner.querySelector('.category-photo-layer');
    const emptyLabel = banner.querySelector('.category-empty-label');
    const productsEl = banner.querySelector('.category-products');

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

    const products = PRODUCTS.filter((p) => p.category === category);
    productsEl.innerHTML = products.map(productCardHTML).join('');

    products.forEach((product) => {
      const photoEl = productsEl.querySelector(`[data-product-photo="${product.id}"]`);
      fetch(`/api/photos?slot=product-${encodeURIComponent(product.id)}`)
        .then((r) => r.json())
        .then((data) => {
          const photos = data.photos || [];
          if (photos.length === 0 || !photoEl) return;
          photoEl.innerHTML = `<img src="${photos[0].url}" alt="${product.name}">`;
        })
        .catch(() => {});
    });
  });

  // Rental products marquee: continuous left-to-right flow, duplicated for a seamless loop
  const marqueeTrack = document.getElementById('marquee-track');
  if (marqueeTrack) {
    const rentalProducts = PRODUCTS.filter((p) => p.category === 'rental');
    const marqueeHTML = rentalProducts.map(productCardHTML).join('');
    marqueeTrack.innerHTML = marqueeHTML + marqueeHTML;

    rentalProducts.forEach((product) => {
      fetch(`/api/photos?slot=product-${encodeURIComponent(product.id)}`)
        .then((r) => r.json())
        .then((data) => {
          const photos = data.photos || [];
          if (photos.length === 0) return;
          marqueeTrack
            .querySelectorAll(`[data-product-photo="${product.id}"]`)
            .forEach((el) => {
              el.innerHTML = `<img src="${photos[0].url}" alt="${product.name}">`;
            });
        })
        .catch(() => {});
    });
  }
})();
