'use strict';

// `api` 는 preload.js 가 window.api 로 노출한 전역
const $ = (s) => document.querySelector(s);
const grid = $('#grid');

const GROUP_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#adb5bd'];

const state = {
  items: [],
  byPath: new Map(),
  groups: [],
  folders: [],
  meta: {},
  settings: {},
  view: { type: 'all', id: null },
  selected: new Set(),
  anchor: null,
  visible: [],
  search: '',
  failed: new Set(),
};

// ---------- 유틸 ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDur(sec) {
  if (sec == null || !isFinite(sec)) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function fmtSize(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(b / 1e3)) + ' KB';
}

function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const metaOf = (p) => state.meta[p] || {};
// 브라우저가 코덱을 못 읽어 ffmpeg 필름스트립으로만 미리보는 영상
const stripOnly = (i) => !i.thumb && !!i.strip;
const isFailed = (i) => !stripOnly(i) && (state.failed.has(i.path) || metaOf(i.path).unsupported === i.key);
const STRIP_FRAMES = 10;
const stripPos = (ratio) => `${(Math.min(STRIP_FRAMES - 1, Math.floor(ratio * STRIP_FRAMES)) / (STRIP_FRAMES - 1)) * 100}% 0`;
const groupsOf = (p) => state.groups.filter((g) => g.items.includes(p));
const baseName = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;

function toast(msg) {
  const el = $('#status');
  el.dataset.toast = msg;
  el.classList.add('toast');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.classList.remove('toast'); renderStatus(); }, 2500);
  el.textContent = msg;
}

// ---------- 데이터 ----------
async function load() {
  const lib = await api.getLibrary();
  state.items = lib.items;
  state.byPath = new Map(lib.items.map((i) => [i.path, i]));
  state.groups = lib.groups;
  state.folders = lib.folders;
  state.meta = lib.meta;
  state.settings = lib.settings || {};
  for (const p of [...state.selected]) if (!state.byPath.has(p)) state.selected.delete(p);
  if (state.view.type === 'group' && !state.groups.some((g) => g.id === state.view.id)) state.view = { type: 'all' };
  if (state.view.type === 'folder' && !state.folders.includes(state.view.id)) state.view = { type: 'all' };
  renderSidebar();
  renderGrid();
}

function saveGroups() {
  return api.saveGroups(state.groups);
}

function setMeta(p, patch) {
  state.meta[p] = { ...metaOf(p), ...patch };
  api.setMeta(p, patch);
}

// ---------- 사이드바 ----------
function renderSidebar() {
  const all = state.items;
  const grouped = new Set(state.groups.flatMap((g) => g.items));
  $('#count-all').textContent = all.length;
  $('#count-fav').textContent = all.filter((i) => metaOf(i.path).fav).length;
  $('#count-ungrouped').textContent = all.filter((i) => !grouped.has(i.path)).length;

  $('#nav-groups').innerHTML = state.groups.map((g) => {
    const n = g.items.filter((p) => state.byPath.has(p)).length;
    return `<button class="nav-item group" data-view="group" data-id="${esc(g.id)}">
      <span class="dot" style="background:${esc(g.color)}"></span><span class="label">${esc(g.name)}</span><span class="count">${n}</span>
    </button>`;
  }).join('') || '<p class="hint">＋ 를 눌러 그룹을 만드세요</p>';
  $('#group-hint').hidden = !state.groups.length;

  $('#nav-folders').innerHTML = state.folders.map((f) => {
    const n = all.filter((i) => i.folder === f).length;
    return `<button class="nav-item folder" data-view="folder" data-id="${esc(f)}" title="${esc(f)}">
      <span class="dot folder-ico">▤</span><span class="label">${esc(baseName(f))}</span><span class="count">${n}</span>
    </button>`;
  }).join('');

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === state.view.type && (el.dataset.id || null) === (state.view.id || null));
  });
}

function setView(type, id = null) {
  state.view = { type, id };
  state.selected.clear();
  renderSidebar();
  renderGrid();
  grid.scrollTop = 0;
}

function viewTitle() {
  const v = state.view;
  if (v.type === 'fav') return '즐겨찾기';
  if (v.type === 'ungrouped') return '그룹 없음';
  if (v.type === 'group') return state.groups.find((g) => g.id === v.id)?.name || '그룹';
  if (v.type === 'folder') return baseName(v.id);
  return '모든 영상';
}

// ---------- 목록 ----------
function currentItems() {
  const v = state.view;
  let list = state.items;
  if (v.type === 'fav') list = list.filter((i) => metaOf(i.path).fav);
  else if (v.type === 'ungrouped') {
    const grouped = new Set(state.groups.flatMap((g) => g.items));
    list = list.filter((i) => !grouped.has(i.path));
  } else if (v.type === 'group') {
    const g = state.groups.find((x) => x.id === v.id);
    list = g ? g.items.map((p) => state.byPath.get(p)).filter(Boolean) : [];
  } else if (v.type === 'folder') list = list.filter((i) => i.folder === v.id);

  const q = state.search.trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/);
    list = list.filter((i) => {
      const hay = [i.name, ...(metaOf(i.path).tags || []), ...groupsOf(i.path).map((g) => g.name)].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  const [key, dir] = $('#sort').value.split('-');
  const sign = dir === 'asc' ? 1 : -1;
  const val = (i) => (key === 'duration' ? metaOf(i.path).duration ?? -1 : key === 'name' ? i.name.toLowerCase() : i[key]);
  // 'added' = 그룹에 넣은 순서 (그룹이 아닌 보기에서는 목록 순서 그대로)
  if (key === 'added') return dir === 'asc' ? list : [...list].reverse();
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    if (key === 'name') return x.localeCompare(y, 'ko', { numeric: true }) * sign;
    return (x - y) * sign;
  });
}

let thumbObserver;

function cardHtml(i) {
  const m = metaOf(i.path);
  const dots = groupsOf(i.path).map((g) => `<span class="gdot" style="background:${esc(g.color)}" title="${esc(g.name)}"></span>`).join('');
  const res = m.width ? `${m.width}×${m.height}` : '';
  const failed = isFailed(i);
  let visual;
  if (i.thumb) visual = `<img src="${esc(i.thumb)}" crossorigin="anonymous" draggable="false" alt="">`;
  else if (i.strip) visual = `<div class="strip" style="background-image:url('${esc(i.strip)}');background-position:${stripPos(0.25)}"></div><span class="codec-note">${esc(i.ext)} · 스트립 미리보기</span>`;
  else visual = `<div class="ph"><div>${failed ? `미리보기 불가<small>${esc(i.ext.toUpperCase())} 코덱 미지원</small>` : '불러오는 중…'}</div></div>`;
  return `<div class="card${state.selected.has(i.path) ? ' selected' : ''}" draggable="true" data-path="${esc(i.path)}">
    <div class="thumb${failed ? ' failed' : ''}">
      ${visual}
      <span class="dur">${fmtDur(m.duration)}</span>
      ${m.fav ? '<span class="fav-badge">★</span>' : ''}
      <div class="scrub"><div class="scrub-bar"></div></div>
      <span class="timecode"></span>
    </div>
    <div class="info">
      <div class="name" title="${esc(i.name)}">${esc(i.name)}</div>
      <div class="sub"><span class="ext">${esc(i.ext)}</span>${res ? `<span>${res}</span>` : ''}<span>${fmtSize(i.size)}</span><span class="dots">${dots}</span></div>
      ${(m.tags || []).length ? `<div class="tags">${m.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

function renderGrid() {
  state.visible = currentItems();
  $('#view-title').textContent = viewTitle();
  $('#empty').hidden = state.items.length > 0 || state.view.type !== 'all';
  grid.hidden = !$('#empty').hidden;
  grid.innerHTML = state.visible.length
    ? state.visible.map(cardHtml).join('')
    : `<div class="grid-empty">${state.view.type === 'group' ? '영상을 이 그룹 위로 끌어다 놓거나, 우클릭 → 그룹에 추가 하세요' : '영상이 없어요'}</div>`;

  thumbObserver?.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const item = state.byPath.get(e.target.dataset.path);
      if (item && needsProbe(item)) enqueueProbe(item);
      thumbObserver.unobserve(e.target);
    }
  }, { root: grid, rootMargin: '400px' });
  grid.querySelectorAll('.card').forEach((c) => thumbObserver.observe(c));
  renderSelbar();
  renderStatus();
}

function refreshCard(p) {
  const old = grid.querySelector(`.card[data-path="${CSS.escape(p)}"]`);
  const item = state.byPath.get(p);
  if (!old || !item) return;
  if (hover?.card === old) stopHover();
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHtml(item);
  old.replaceWith(tmp.firstElementChild);
  // 길이 정보가 새로 들어왔으니 하단 합계도 갱신 (한 번에 몰아서)
  clearTimeout(refreshCard.t);
  refreshCard.t = setTimeout(renderStatus, 200);
}

function renderStatus() {
  const el = $('#status');
  if (el.classList.contains('toast')) return;
  const list = state.visible;
  const size = list.reduce((s, i) => s + i.size, 0);
  const dur = list.reduce((s, i) => s + (metaOf(i.path).duration || 0), 0);
  el.textContent = `${list.length}개 영상 · ${fmtSize(size)} · 총 ${fmtDur(dur) || '0:00'}` +
    `   |   마우스를 올리면 미리보기 · 좌우로 움직이면 탐색 · 끌어서 편집 프로그램에 놓기 · Space 크게 보기`;
}

function renderSelbar() {
  const n = state.selected.size;
  $('#selbar').hidden = n === 0;
  $('#sel-count').textContent = `${n}개 선택됨`;
  $('#sel-remove').hidden = state.view.type !== 'group';
}

// ---------- 썸네일 · 메타데이터 ----------
const probeQueue = [];
let probing = 0;

function needsProbe(i) {
  if (stripOnly(i) || isFailed(i)) return false;
  return !i.thumb || metaOf(i.path).duration == null;
}

function enqueueProbe(item) {
  if (item._queued) return;
  item._queued = true;
  probeQueue.push(item);
  pumpProbe();
}

function pumpProbe() {
  while (probing < 3 && probeQueue.length) {
    const item = probeQueue.shift();
    probing++;
    probe(item).finally(() => { probing--; item._queued = false; pumpProbe(); });
  }
}

function probe(item) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    let done = false;
    const finish = async (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      if (!ok) {
        // 크로미움이 못 읽는 코덱 → ffmpeg 로 필름스트립 생성 시도
        const res = await api.ffmpegStrip(item.path, item.key).catch(() => null);
        if (res) {
          item.strip = res.strip;
          setMeta(item.path, { duration: res.duration, width: res.width, height: res.height });
        } else {
          state.failed.add(item.path);
          setMeta(item.path, { unsupported: item.key });
        }
        refreshCard(item.path);
      }
      resolve();
    };
    const timer = setTimeout(() => finish(false), 12000);
    v.addEventListener('error', () => finish(false));
    v.addEventListener('loadedmetadata', () => {
      if (!v.videoWidth) return finish(false); // 오디오만 있거나 영상 코덱을 못 읽음
      setMeta(item.path, { duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      if (item.thumb) { refreshCard(item.path); return finish(true); }
      v.currentTime = Math.min(v.duration * 0.1, 5);
    });
    v.addEventListener('seeked', async () => {
      try {
        const w = 480, h = Math.round((w * v.videoHeight) / v.videoWidth);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        const res = await api.saveThumb(item.key, c.toDataURL('image/jpeg', 0.82));
        Object.assign(item, res);
        refreshCard(item.path);
        finish(true);
      } catch { finish(false); }
    }, { once: true });
    v.src = item.url;
  });
}

// ---------- 마우스 올려서 미리보기 ----------
let hover = null; // { card, video, item, idle }

function startHover(card) {
  if (hover?.card === card) return;
  stopHover();
  const item = state.byPath.get(card.dataset.path);
  if (!item || isFailed(item)) return;
  card.classList.add('hovering');
  if (stripOnly(item)) {
    hover = { card, item, strip: card.querySelector('.strip') };
    return;
  }
  const thumb = card.querySelector('.thumb');
  const v = document.createElement('video');
  v.className = 'preview';
  v.muted = !$('#sound').checked;
  v.loop = true;
  v.playsInline = true;
  v.crossOrigin = 'anonymous';
  v.src = item.url;
  thumb.appendChild(v);
  hover = { card, video: v, item, idle: null, ratio: null };
  v.addEventListener('loadedmetadata', () => {
    if (hover?.video !== v) return;
    if (hover.ratio != null) v.currentTime = hover.ratio * v.duration;
    v.play().catch(() => {});
  });
  v.addEventListener('playing', () => v.classList.add('ready'));
  v.addEventListener('seeked', () => v.classList.add('ready'));
  v.addEventListener('timeupdate', () => {
    if (hover?.video !== v || !v.duration) return;
    card.querySelector('.scrub-bar').style.width = (v.currentTime / v.duration) * 100 + '%';
    card.querySelector('.timecode').textContent = `${fmtTime(v.currentTime)} / ${fmtDur(v.duration)}`;
  });
}

function scrubHover(e) {
  if (!hover) return;
  const rect = hover.card.querySelector('.thumb').getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  hover.ratio = ratio;
  hover.card.querySelector('.scrub-bar').style.width = ratio * 100 + '%';
  if (hover.strip) {
    hover.strip.style.backgroundPosition = stripPos(ratio);
    const d = metaOf(hover.item.path).duration;
    if (d) hover.card.querySelector('.timecode').textContent = `${fmtTime(ratio * d)} / ${fmtDur(d)}`;
    return;
  }
  const v = hover.video;
  if (!v.duration) return;
  v.pause();
  v.currentTime = ratio * v.duration;
  hover.card.querySelector('.timecode').textContent = `${fmtTime(ratio * v.duration)} / ${fmtDur(v.duration)}`;
  // 마우스를 멈추면 그 지점부터 재생
  clearTimeout(hover.idle);
  hover.idle = setTimeout(() => v.play().catch(() => {}), 450);
}

function stopHover() {
  if (!hover) return;
  clearTimeout(hover.idle);
  if (hover.strip) hover.strip.style.backgroundPosition = stripPos(0.25);
  if (hover.video) {
    hover.video.pause();
    hover.video.removeAttribute('src');
    hover.video.load();
    hover.video.remove();
  }
  hover.card.classList.remove('hovering');
  hover.card.querySelector('.scrub-bar').style.width = '0';
  hover.card.querySelector('.timecode').textContent = '';
  hover = null;
}

grid.addEventListener('mouseover', (e) => {
  const card = e.target.closest('.thumb')?.closest('.card');
  if (card) startHover(card);
});
grid.addEventListener('mousemove', (e) => {
  if (hover && e.target.closest('.thumb') && hover.card.contains(e.target)) scrubHover(e);
  else if (hover && !hover.card.querySelector('.thumb').contains(e.target)) stopHover();
});
grid.addEventListener('mouseleave', stopHover);
grid.addEventListener('scroll', stopHover, { passive: true });

// ---------- 선택 ----------
function selectCard(p, e) {
  const idx = state.visible.findIndex((i) => i.path === p);
  if (e.shiftKey && state.anchor) {
    const a = state.visible.findIndex((i) => i.path === state.anchor);
    const [s, t] = a < idx ? [a, idx] : [idx, a];
    if (!(e.ctrlKey || e.metaKey)) state.selected.clear();
    for (let k = s; k <= t; k++) state.selected.add(state.visible[k].path);
  } else if (e.ctrlKey || e.metaKey) {
    state.selected.has(p) ? state.selected.delete(p) : state.selected.add(p);
    state.anchor = p;
  } else {
    state.selected.clear();
    state.selected.add(p);
    state.anchor = p;
  }
  grid.querySelectorAll('.card').forEach((c) => c.classList.toggle('selected', state.selected.has(c.dataset.path)));
  renderSelbar();
}

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) {
    state.selected.clear();
    grid.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
    renderSelbar();
    return;
  }
  selectCard(card.dataset.path, e);
});
grid.addEventListener('dblclick', (e) => {
  const card = e.target.closest('.card');
  if (card) openPlayer(card.dataset.path);
});

function selectionFor(p) {
  return state.selected.has(p) ? state.visible.map((i) => i.path).filter((x) => state.selected.has(x)) : [p];
}

// ---------- 끌어서 꺼내 쓰기 (편집 프로그램으로) ----------
function dragIcon(paths) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 90;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2d35';
  ctx.fillRect(0, 0, 160, 90);
  const img = grid.querySelector(`.card[data-path="${CSS.escape(paths[0])}"] img`);
  try {
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, 160, 90);
    if (paths.length > 1) {
      ctx.fillStyle = '#4dabf7';
      ctx.beginPath(); ctx.arc(140, 18, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(paths.length), 140, 19);
    }
    return c.toDataURL('image/png');
  } catch { return null; }
}

grid.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  stopHover();
  const paths = selectionFor(card.dataset.path);
  api.startDrag(paths, dragIcon(paths));
});

// ---------- 끌어다 넣기 (탐색기 → 앱, 카드 → 그룹) ----------
function droppedPaths(e) {
  return [...(e.dataTransfer?.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
}

let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  if (!e.target.closest?.('#sidebar')) $('#drop-overlay').hidden = false;
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#drop-overlay').hidden = true;
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  const inSidebar = !!e.target.closest?.('#sidebar');
  $('#drop-overlay').hidden = inSidebar;
  document.querySelectorAll('.nav-item.drop').forEach((el) => el.classList.remove('drop'));
  const target = e.target.closest?.('.nav-item.group');
  if (target) target.classList.add('drop');
  e.dataTransfer.dropEffect = inSidebar && !target ? 'none' : 'copy';
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop-overlay').hidden = true;
  document.querySelectorAll('.nav-item.drop').forEach((el) => el.classList.remove('drop'));
  const paths = droppedPaths(e);
  if (!paths.length) return;
  const target = e.target.closest?.('.nav-item.group');
  if (target) {
    const g = state.groups.find((x) => x.id === target.dataset.id);
    const known = paths.filter((p) => state.byPath.has(p));
    if (known.length === paths.length) {
      const before = g.items.length;
      for (const p of known) if (!g.items.includes(p)) g.items.push(p);
      await saveGroups();
      toast(`"${g.name}"에 ${g.items.length - before}개 추가`);
      renderSidebar(); renderGrid();
    } else {
      const n = await api.addPaths(paths, g.id);
      toast(`"${g.name}"에 ${n}개 추가`);
      await load();
    }
    return;
  }
  if (e.target.closest?.('#sidebar')) return;
  // 이미 라이브러리에 있는 영상을 그리드에 다시 떨어뜨린 경우(자기 자신 드래그)는 무시
  if (paths.every((p) => state.byPath.has(p))) return;
  const n = await api.addPaths(paths, state.view.type === 'group' ? state.view.id : null);
  await load();
  toast(n ? `영상 ${n}개 추가` : '폴더를 추가했어요');
});

// ---------- 그룹 ----------
function newGroupId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function createGroup(paths = []) {
  const name = await askText('새 그룹 이름', '');
  if (!name) return null;
  const g = { id: newGroupId(), name, color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length], items: [...paths] };
  state.groups.push(g);
  await saveGroups();
  renderSidebar();
  renderGrid();
  return g;
}

async function addToGroup(g, paths) {
  let n = 0;
  for (const p of paths) if (!g.items.includes(p)) { g.items.push(p); n++; }
  await saveGroups();
  toast(`"${g.name}"에 ${n}개 추가`);
  renderSidebar();
  renderGrid();
}

async function removeFromGroup(g, paths) {
  g.items = g.items.filter((p) => !paths.includes(p));
  paths.forEach((p) => state.selected.delete(p));
  await saveGroups();
  toast(`"${g.name}"에서 ${paths.length}개 뺐어요`);
  renderSidebar();
  renderGrid();
}

$('#btn-new-group').addEventListener('click', () => createGroup());

// ---------- 폴더 ----------
async function addFolders() {
  if (await api.addFolders()) {
    toast('폴더를 읽는 중…');
    await load();
    toast(`영상 ${state.items.length}개`);
  }
}
$('#btn-add-folder').addEventListener('click', addFolders);
$('#btn-empty-add').addEventListener('click', addFolders);
$('#btn-refresh').addEventListener('click', async () => { await load(); toast('새로고침 완료'); });

// ---------- 사이드바 이벤트 ----------
document.querySelector('#sidebar').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) setView(item.dataset.view, item.dataset.id || null);
});

document.querySelector('#sidebar').addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.nav-item');
  if (!el) return;
  e.preventDefault();
  if (el.dataset.view === 'group') {
    const g = state.groups.find((x) => x.id === el.dataset.id);
    const files = g.items.filter((p) => state.byPath.has(p));
    showMenu(e, [
      { label: '이름 바꾸기', run: async () => { const n = await askText('그룹 이름', g.name); if (n) { g.name = n; await saveGroups(); renderSidebar(); renderGrid(); } } },
      { label: '색상', sub: GROUP_COLORS.map((c) => ({ label: `<span class="swatch" style="background:${c}"></span>`, html: true, checked: g.color === c, run: async () => { g.color = c; await saveGroups(); renderSidebar(); renderGrid(); } })) },
      { label: '위로 이동', disabled: state.groups[0] === g, run: () => moveGroup(g, -1) },
      { label: '아래로 이동', disabled: state.groups.at(-1) === g, run: () => moveGroup(g, 1) },
      '-',
      { label: `그룹 영상 폴더로 복사 (${files.length}개)…`, disabled: !files.length, run: () => exportFiles(files, g.name) },
      { label: '경로 모두 복사', disabled: !files.length, run: () => { api.copyPaths(files); toast('경로를 복사했어요'); } },
      '-',
      { label: '그룹 삭제', danger: true, run: async () => {
        if (!(await api.confirm(`"${g.name}" 그룹을 삭제할까요?`, '영상 파일은 지워지지 않고 그룹만 없어집니다.'))) return;
        state.groups = state.groups.filter((x) => x !== g);
        await saveGroups();
        if (state.view.id === g.id) state.view = { type: 'all' };
        renderSidebar(); renderGrid();
      } },
    ]);
  } else if (el.dataset.view === 'folder') {
    const f = el.dataset.id;
    showMenu(e, [
      { label: '탐색기에서 열기', run: () => api.open(f) },
      { label: '라이브러리에서 제거', danger: true, run: async () => {
        if (!(await api.confirm(`"${baseName(f)}" 폴더를 목록에서 뺄까요?`, '실제 파일은 지워지지 않습니다.'))) return;
        await api.removeFolder(f);
        await load();
      } },
    ]);
  }
});

async function moveGroup(g, d) {
  const i = state.groups.indexOf(g);
  state.groups.splice(i, 1);
  state.groups.splice(i + d, 0, g);
  await saveGroups();
  renderSidebar();
}

// ---------- 카드 우클릭 메뉴 ----------
grid.addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  const p = card.dataset.path;
  if (!state.selected.has(p)) selectCard(p, {});
  const paths = selectionFor(p);
  const multi = paths.length > 1;
  const allFav = paths.every((x) => metaOf(x).fav);
  const curGroup = state.view.type === 'group' ? state.groups.find((g) => g.id === state.view.id) : null;
  showMenu(e, [
    { label: '크게 보기 (Space)', disabled: multi, run: () => openPlayer(p) },
    { label: allFav ? '즐겨찾기 해제' : '즐겨찾기', run: () => { paths.forEach((x) => setMeta(x, { fav: !allFav })); renderSidebar(); renderGrid(); } },
    { label: '그룹에 추가', sub: [
      ...state.groups.map((g) => ({
        label: `<span class="swatch" style="background:${esc(g.color)}"></span>${esc(g.name)}`, html: true,
        checked: paths.every((x) => g.items.includes(x)),
        run: () => addToGroup(g, paths),
      })),
      ...(state.groups.length ? ['-'] : []),
      { label: '새 그룹 만들기…', run: () => createGroup(paths) },
    ] },
    ...(curGroup ? [{ label: `"${curGroup.name}"에서 빼기 (Delete)`, run: () => removeFromGroup(curGroup, paths) }] : []),
    { label: '태그 편집…', run: () => editTags(paths) },
    '-',
    { label: api.platform === 'darwin' ? 'Finder에서 보기' : '탐색기에서 보기', disabled: multi, run: () => api.reveal(p) },
    { label: '기본 프로그램으로 열기', disabled: multi, run: () => api.open(p) },
    { label: '경로 복사', run: () => { api.copyPaths(paths); toast('경로를 복사했어요'); } },
    { label: '다른 폴더로 복사…', run: () => exportFiles(paths, multi ? `${paths.length}개 영상` : baseName(p)) },
  ]);
});

async function editTags(paths) {
  const common = paths.map((p) => metaOf(p).tags || []).reduce((a, b) => a.filter((t) => b.includes(t)));
  const input = await askText('태그 (쉼표로 구분)', common.join(', '));
  if (input == null) return;
  const next = [...new Set(input.split(/[,#]/).map((t) => t.trim()).filter(Boolean))];
  for (const p of paths) {
    const own = (metaOf(p).tags || []).filter((t) => !common.includes(t));
    setMeta(p, { tags: [...new Set([...own, ...next])] });
  }
  renderGrid();
}

async function exportFiles(paths, name) {
  const n = await api.exportFiles(paths, name);
  if (n) toast(`${n}개 복사 완료`);
}

// ---------- 선택 바 ----------
$('#selbar').addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const paths = state.visible.map((i) => i.path).filter((p) => state.selected.has(p));
  if (act === 'clear') { state.selected.clear(); renderGrid(); }
  if (act === 'copy') { api.copyPaths(paths); toast('경로를 복사했어요'); }
  if (act === 'export') exportFiles(paths, `${paths.length}개 영상`);
  if (act === 'remove-group') removeFromGroup(state.groups.find((g) => g.id === state.view.id), paths);
  if (act === 'add-group') {
    const r = e.target.getBoundingClientRect();
    showMenu({ clientX: r.left, clientY: r.bottom + 4 }, [
      ...state.groups.map((g) => ({ label: `<span class="swatch" style="background:${esc(g.color)}"></span>${esc(g.name)}`, html: true, run: () => addToGroup(g, paths) })),
      ...(state.groups.length ? ['-'] : []),
      { label: '새 그룹 만들기…', run: () => createGroup(paths) },
    ]);
  }
});

// ---------- 메뉴 ----------
const menuEl = $('#menu');

function buildMenu(items) {
  const ul = document.createElement('div');
  ul.className = 'menu-list';
  for (const it of items) {
    if (it === '-') { ul.appendChild(Object.assign(document.createElement('div'), { className: 'sep' })); continue; }
    const b = document.createElement('div');
    b.className = 'menu-item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : '') + (it.sub ? ' has-sub' : '');
    const label = document.createElement('span');
    label.className = 'ml';
    if (it.html) label.innerHTML = it.label; else label.textContent = it.label;
    b.innerHTML = `<span class="check">${it.checked ? '✓' : ''}</span>`;
    b.appendChild(label);
    if (it.sub) {
      b.insertAdjacentHTML('beforeend', '<span class="arrow">›</span>');
      const sub = buildMenu(it.sub);
      sub.classList.add('submenu');
      b.appendChild(sub);
    } else if (!it.disabled) {
      b.addEventListener('click', (ev) => { ev.stopPropagation(); hideMenu(); it.run(); });
    }
    ul.appendChild(b);
  }
  return ul;
}

function showMenu(e, items) {
  stopHover();
  menuEl.innerHTML = '';
  menuEl.appendChild(buildMenu(items));
  menuEl.hidden = false;
  const { innerWidth: W, innerHeight: H } = window;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(e.clientX, W - r.width - 8) + 'px';
  menuEl.style.top = Math.min(e.clientY, H - r.height - 8) + 'px';
  menuEl.classList.toggle('flip', e.clientX + r.width * 2 > W);
}

function hideMenu() { menuEl.hidden = true; }
document.addEventListener('mousedown', (e) => { if (!menuEl.contains(e.target)) hideMenu(); });
window.addEventListener('blur', hideMenu);

// ---------- 텍스트 입력 창 (Electron은 prompt()를 지원하지 않음) ----------
function askText(title, value) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<form class="modal-box"><label>${esc(title)}</label><input value="${esc(value)}" spellcheck="false">
      <div class="modal-btns"><button type="button" class="btn ghost" data-x>취소</button><button class="btn primary">확인</button></div></form>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input');
    input.focus(); input.select();
    const close = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); close(input.value.trim()); });
    wrap.querySelector('[data-x]').addEventListener('click', () => close(null));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } });
  });
}

// ---------- 크게 보기 ----------
const player = $('#player');
const pv = $('#player-video');

function openPlayer(p) {
  const item = state.byPath.get(p);
  if (!item) return;
  stopHover();
  // 앱에서 재생할 수 없는 코덱은 기본 플레이어로
  if (stripOnly(item) || isFailed(item)) { api.open(p); return; }
  const m = metaOf(p);
  $('#player-title').textContent = item.name;
  $('#player-info').textContent = [m.width && `${m.width}×${m.height}`, fmtDur(m.duration), fmtSize(item.size), fmtDate(item.mtime), item.path].filter(Boolean).join('   ·   ');
  pv.src = item.url;
  pv.muted = false;
  player.hidden = false;
  player.dataset.path = p;
  pv.play().catch(() => {});
}

function closePlayer() {
  pv.pause();
  pv.removeAttribute('src');
  pv.load();
  player.hidden = true;
}

$('#player-close').addEventListener('click', closePlayer);
player.addEventListener('mousedown', (e) => { if (e.target === player) closePlayer(); });

// ---------- 키보드 ----------
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal')) return;
  const typing = e.target.matches('input, textarea, select');
  if (e.key === 'Escape') {
    if (!player.hidden) return closePlayer();
    if (!menuEl.hidden) return hideMenu();
    if (typing && e.target.id === 'search') { e.target.value = ''; state.search = ''; renderGrid(); e.target.blur(); return; }
    state.selected.clear(); renderGrid();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); return; }
  if (e.key === 'F5') { e.preventDefault(); $('#btn-refresh').click(); return; }
  if (typing) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (!player.hidden) return closePlayer();
    const p = hover?.item.path || [...state.selected].at(-1);
    if (p) openPlayer(p);
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    state.visible.forEach((i) => state.selected.add(i.path));
    renderGrid();
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.view.type === 'group' && state.selected.size) {
    const g = state.groups.find((x) => x.id === state.view.id);
    removeFromGroup(g, [...state.selected]);
  }
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && state.selected.size) {
    const paths = [...state.selected];
    const allFav = paths.every((x) => metaOf(x).fav);
    paths.forEach((x) => setMeta(x, { fav: !allFav }));
    renderSidebar(); renderGrid();
  }
});

// ---------- 툴바 ----------
$('#search').addEventListener('input', (e) => { state.search = e.target.value; renderGrid(); });
$('#sort').addEventListener('change', (e) => { api.setSettings({ sort: e.target.value }); renderGrid(); });
$('#zoom').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--card', e.target.value + 'px');
  api.setSettings({ zoom: Number(e.target.value) });
});
$('#sound').addEventListener('change', (e) => {
  api.setSettings({ sound: e.target.checked });
  if (hover?.video) hover.video.muted = !e.target.checked;
});

// ---------- 시작 ----------
(async () => {
  await load();
  const s = state.settings;
  if (s.sort) $('#sort').value = s.sort;
  $('#zoom').value = s.zoom || 240;
  document.documentElement.style.setProperty('--card', ($('#zoom').value) + 'px');
  $('#sound').checked = !!s.sound;
  renderGrid();
})();
