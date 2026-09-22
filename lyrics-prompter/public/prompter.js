const placeholderEl = document.getElementById('placeholder');
const stageEl = document.getElementById('stage');
const titleEl = document.getElementById('song-title');
const lyricsEl = document.getElementById('lyrics');

const DEFAULT_FONT = 64;

function showSong(song) {
  titleEl.textContent = song.title;
  lyricsEl.textContent = song.lyrics;
  placeholderEl.style.display = 'none';
  stageEl.style.display = 'block';
  window.scrollTo(0, 0);
}

function clearLyrics() {
  titleEl.textContent = '';
  lyricsEl.textContent = '';
  stageEl.style.display = 'none';
  placeholderEl.style.display = 'flex';
}

function setFontSize(size) {
  lyricsEl.style.fontSize = `${size}px`;
}

PrompterBus.onMessage((msg) => {
  if (msg.type === 'show') showSong(msg.song);
  else if (msg.type === 'clear') clearLyrics();
  else if (msg.type === 'fontSize') setFontSize(msg.size);
});

// 창이 늦게 열렸을 때 콘솔이 마지막으로 보내둔 상태를 복원
setFontSize(PrompterBus.getFontSize(DEFAULT_FONT));
const current = PrompterBus.getCurrent();
if (current && current.type === 'show') {
  showSong(current.song);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    window.scrollBy({ top: 200, behavior: 'smooth' });
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    window.scrollBy({ top: -200, behavior: 'smooth' });
  }
});
