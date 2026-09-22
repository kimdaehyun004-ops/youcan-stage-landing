const placeholderEl = document.getElementById('placeholder');
const stageEl = document.getElementById('stage');
const titleEl = document.getElementById('song-title');
const lyricsEl = document.getElementById('lyrics');

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

window.prompterAPI.onShow(showSong);
window.prompterAPI.onClear(clearLyrics);
window.prompterAPI.onFontSize((size) => {
  lyricsEl.style.fontSize = `${size}px`;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    window.prompterAPI.toggleFullscreen();
  } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    window.scrollBy({ top: 200, behavior: 'smooth' });
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    window.scrollBy({ top: -200, behavior: 'smooth' });
  }
});
