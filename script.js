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
    const previous = Array.from(heroPhotoLayer.children);
    const div = document.createElement('div');
    div.className = 'hero-photo';
    div.style.backgroundImage = `url("${heroPhotos[index].url}")`;
    heroPhotoLayer.appendChild(div);
    requestAnimationFrame(() => {
      div.classList.add('visible');
    });
    // Keep the old photo underneath until the new one has fully faded in, then drop it —
    // this is what makes the swap read as a dissolve instead of a blink.
    setTimeout(() => {
      previous.forEach((el) => el.remove());
    }, 1300);
  }

  function startHeroRotation() {
    if (heroTimer) clearInterval(heroTimer);
    if (heroPhotos.length <= 1) return;
    heroTimer = setInterval(() => {
      heroCurrent = (heroCurrent + 1) % heroPhotos.length;
      showHeroPhoto(heroCurrent);
    }, 5000);
  }

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

  const banners = Array.from(document.querySelectorAll('.category-banner'));
  const rentalProducts = PRODUCTS.filter((p) => p.category === 'rental');
  const marqueeTrack = document.getElementById('marquee-track');

  // Render product cards up front (markup doesn't need photos to exist yet).
  banners.forEach((banner) => {
    const category = banner.dataset.category;
    const productsEl = banner.querySelector('.category-products');
    const products = PRODUCTS.filter((p) => (p.caseTypes || []).includes(category));
    banner._products = products;
    productsEl.innerHTML = products.map(productCardHTML).join('');
  });

  if (marqueeTrack) {
    const marqueeHTML = rentalProducts.map(productCardHTML).join('');
    marqueeTrack.innerHTML = marqueeHTML + marqueeHTML;
  }

  // Gather every slot this page needs and fetch them all in a single request,
  // instead of one /api/photos call per slot (was ~46 round trips).
  const neededSlots = new Set(['hero']);
  banners.forEach((banner) => {
    neededSlots.add(banner.dataset.slot);
    banner._products.forEach((p) => neededSlots.add(`product-${p.id}`));
  });
  rentalProducts.forEach((p) => neededSlots.add(`product-${p.id}`));

  fetch(`/api/photos?slots=${encodeURIComponent([...neededSlots].join(','))}`)
    .then((r) => r.json())
    .then((data) => {
      const photosBySlot = data.photosBySlot || {};

      heroPhotos = photosBySlot.hero || [];
      if (heroPhotos.length > 0) {
        heroEmptyLabel.style.display = 'none';
        showHeroPhoto(0);
        startHeroRotation();
      }

      banners.forEach((banner) => {
        const slot = banner.dataset.slot;
        const photoLayer = banner.querySelector('.category-photo-layer');
        const emptyLabel = banner.querySelector('.category-empty-label');
        const photos = photosBySlot[slot] || [];
        if (photos.length > 0) {
          emptyLabel.style.display = 'none';
          const div = document.createElement('div');
          div.className = 'category-photo';
          div.style.backgroundImage = `url("${photos[0].url}")`;
          photoLayer.appendChild(div);
          requestAnimationFrame(() => div.classList.add('visible'));
        }

        const productsEl = banner.querySelector('.category-products');
        banner._products.forEach((product) => {
          const photos = photosBySlot[`product-${product.id}`] || [];
          if (photos.length === 0) return;
          const photoEl = productsEl.querySelector(`[data-product-photo="${product.id}"]`);
          if (photoEl) photoEl.innerHTML = `<img src="${photos[0].url}" alt="${product.name}">`;
        });
      });

      if (marqueeTrack) {
        rentalProducts.forEach((product) => {
          const photos = photosBySlot[`product-${product.id}`] || [];
          if (photos.length === 0) return;
          marqueeTrack
            .querySelectorAll(`[data-product-photo="${product.id}"]`)
            .forEach((el) => {
              el.innerHTML = `<img src="${photos[0].url}" alt="${product.name}">`;
            });
        });
      }
    })
    .catch(() => {});
})();
