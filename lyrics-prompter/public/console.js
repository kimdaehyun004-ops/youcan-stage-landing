const songListEl = document.getElementById('song-list');
const searchInputEl = document.getElementById('search-input');
const titleInputEl = document.getElementById('title-input');
const lyricsInputEl = document.getElementById('lyrics-input');
const newSongBtn = document.getElementById('new-song-btn');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const sendBtn = document.getElementById('send-btn');
const clearPrompterBtn = document.getElementById('clear-prompter-btn');
const openPrompterBtn = document.getElementById('open-prompter-btn');
const fontMinusBtn = document.getElementById('font-minus-btn');
const fontPlusBtn = document.getElementById('font-plus-btn');
const fontSizeLabel = document.getElementById('font-size-label');
const nowShowingEl = document.getElementById('now-showing');
const promptStatusWrap = nowShowingEl.parentElement;

const MIN_FONT = 28;
const MAX_FONT = 140;
const FONT_STEP = 4;
const DEFAULT_FONT = 64;

let songs = [];
let selectedId = null;
let onAirId = null;
let fontSize = PrompterBus.getFontSize(DEFAULT_FONT);
let prompterWindowRef = null;

function refreshSongs() {
  songs = SongStorage.getAll();
  renderList();
}

function renderList() {
  const query = searchInputEl.value.trim().toLowerCase();
  const filtered = query
    ? songs.filter((s) => s.title.toLowerCase().includes(query))
    : songs;

  songListEl.innerHTML = '';
  for (const song of filtered) {
    const li = document.createElement('li');
    li.className = 'song-item';
    if (song.id === selectedId) li.classList.add('active');
    if (song.id === onAirId) li.classList.add('on-air');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'song-title';
    titleSpan.textContent = song.title;
    li.appendChild(titleSpan);

    if (song.id === onAirId) {
      const badge = document.createElement('span');
      badge.className = 'song-item-live-badge';
      badge.textContent = 'LIVE';
      li.appendChild(badge);
    }

    li.addEventListener('click', () => selectSong(song.id));
    li.addEventListener('dblclick', () => sendToPrompter(song.id));

    songListEl.appendChild(li);
  }
}

function selectSong(id) {
  const song = songs.find((s) => s.id === id);
  if (!song) return;
  selectedId = id;
  titleInputEl.value = song.title;
  lyricsInputEl.value = song.lyrics;
  deleteBtn.hidden = false;
  renderList();
}

function startNewSong() {
  selectedId = null;
  titleInputEl.value = '';
  lyricsInputEl.value = '';
  deleteBtn.hidden = true;
  titleInputEl.focus();
  renderList();
}

function saveSong() {
  const title = titleInputEl.value.trim();
  if (!title) {
    titleInputEl.focus();
    return null;
  }
  const lyrics = lyricsInputEl.value;

  let song;
  if (selectedId) {
    song = SongStorage.update(selectedId, { title, lyrics });
  } else {
    song = SongStorage.add({ title, lyrics });
    selectedId = song.id;
    deleteBtn.hidden = false;
  }
  refreshSongs();
  return song;
}

function deleteSong() {
  if (!selectedId) return;
  const song = songs.find((s) => s.id === selectedId);
  const ok = confirm(`"${song ? song.title : '이 곡'}"을(를) 삭제할까요?`);
  if (!ok) return;

  if (selectedId === onAirId) {
    PrompterBus.clear();
    onAirId = null;
    setOnAirStatus(null);
  }
  SongStorage.remove(selectedId);
  startNewSong();
  refreshSongs();
}

function sendToPrompter(idOverride) {
  const id = idOverride || selectedId;
  if (!id) return;

  // Persist any unsaved edits before sending live.
  let song = id === selectedId ? saveSong() : SongStorage.getById(id);
  if (!song) return;

  ensurePrompterWindow();
  PrompterBus.showSong(song);
  onAirId = song.id;
  setOnAirStatus(song.title);
  renderList();
}

function setOnAirStatus(title) {
  if (title) {
    nowShowingEl.textContent = `프롬프터: "${title}" 표시 중`;
    promptStatusWrap.classList.add('live');
  } else {
    nowShowingEl.textContent = '프롬프터: 대기 중';
    promptStatusWrap.classList.remove('live');
  }
}

function clearPrompter() {
  PrompterBus.clear();
  onAirId = null;
  setOnAirStatus(null);
  renderList();
}

function changeFontSize(delta) {
  fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, fontSize + delta));
  fontSizeLabel.textContent = `${fontSize}px`;
  PrompterBus.setFontSize(fontSize);
}

async function ensurePrompterWindow() {
  if (prompterWindowRef && !prompterWindowRef.closed) {
    prompterWindowRef.focus();
    return;
  }
  await openPrompterWindow();
}

async function openPrompterWindow() {
  let features = 'width=1280,height=720';

  if ('getScreenDetails' in window) {
    try {
      const details = await window.getScreenDetails();
      const current = details.currentScreen;
      const secondary = details.screens.find((s) => s !== current);
      if (secondary) {
        features = `left=${secondary.availLeft},top=${secondary.availTop},width=${secondary.availWidth},height=${secondary.availHeight}`;
      }
    } catch (err) {
      // 권한 거부 또는 미지원 브라우저 - 기본 창으로 폴백
    }
  }

  prompterWindowRef = window.open('prompter.html', 'lyrics-prompter-window', features);
}

newSongBtn.addEventListener('click', startNewSong);
saveBtn.addEventListener('click', saveSong);
deleteBtn.addEventListener('click', deleteSong);
sendBtn.addEventListener('click', () => sendToPrompter());
clearPrompterBtn.addEventListener('click', clearPrompter);
openPrompterBtn.addEventListener('click', ensurePrompterWindow);
fontMinusBtn.addEventListener('click', () => changeFontSize(-FONT_STEP));
fontPlusBtn.addEventListener('click', () => changeFontSize(FONT_STEP));
searchInputEl.addEventListener('input', renderList);

document.addEventListener('keydown', (e) => {
  const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.key === 's';
  if (isSaveShortcut) {
    e.preventDefault();
    saveSong();
  }
});

fontSizeLabel.textContent = `${fontSize}px`;
refreshSongs();
