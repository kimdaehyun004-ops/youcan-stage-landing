// 곡 목록을 브라우저 localStorage에 저장/조회. console.html, prompter.html이 같은
// origin(http://localhost:PORT)에서 열려야 데이터가 공유됩니다.
const SongStorage = (() => {
  const STORAGE_KEY = 'lp:songs';

  function readSongs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeSongs(songs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  return {
    getAll() {
      return readSongs().sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    },

    getById(id) {
      return readSongs().find((s) => s.id === id) || null;
    },

    add({ title, lyrics }) {
      const songs = readSongs();
      const now = new Date().toISOString();
      const song = {
        id: uid(),
        title: (title || '').trim() || '제목 없음',
        lyrics: lyrics || '',
        createdAt: now,
        updatedAt: now,
      };
      songs.push(song);
      writeSongs(songs);
      return song;
    },

    update(id, patch) {
      const songs = readSongs();
      const song = songs.find((s) => s.id === id);
      if (!song) return null;
      if (typeof patch.title === 'string') song.title = patch.title.trim() || '제목 없음';
      if (typeof patch.lyrics === 'string') song.lyrics = patch.lyrics;
      song.updatedAt = new Date().toISOString();
      writeSongs(songs);
      return song;
    },

    remove(id) {
      const songs = readSongs();
      const idx = songs.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      songs.splice(idx, 1);
      writeSongs(songs);
      return true;
    },
  };
})();
