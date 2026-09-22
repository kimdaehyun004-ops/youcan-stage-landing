const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

class SongStore {
  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'songs.json');
    this.songs = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.songs, null, 2), 'utf-8');
  }

  getAll() {
    return [...this.songs].sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  }

  getById(id) {
    return this.songs.find((s) => s.id === id) || null;
  }

  add({ title, lyrics }) {
    const now = new Date().toISOString();
    const song = {
      id: crypto.randomUUID(),
      title: (title || '').trim() || '제목 없음',
      lyrics: lyrics || '',
      createdAt: now,
      updatedAt: now,
    };
    this.songs.push(song);
    this._save();
    return song;
  }

  update(id, patch) {
    const song = this.getById(id);
    if (!song) return null;
    if (typeof patch.title === 'string') {
      song.title = patch.title.trim() || '제목 없음';
    }
    if (typeof patch.lyrics === 'string') {
      song.lyrics = patch.lyrics;
    }
    song.updatedAt = new Date().toISOString();
    this._save();
    return song;
  }

  remove(id) {
    const idx = this.songs.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.songs.splice(idx, 1);
    this._save();
    return true;
  }
}

module.exports = SongStore;
