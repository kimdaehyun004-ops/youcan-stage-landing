const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('consoleAPI', {
  getAllSongs: () => ipcRenderer.invoke('songs:getAll'),
  addSong: (song) => ipcRenderer.invoke('songs:add', song),
  updateSong: (id, patch) => ipcRenderer.invoke('songs:update', id, patch),
  deleteSong: (id) => ipcRenderer.invoke('songs:delete', id),
  loadToPrompter: (id) => ipcRenderer.invoke('prompter:load', id),
  clearPrompter: () => ipcRenderer.invoke('prompter:clear'),
  setFontSize: (size) => ipcRenderer.invoke('prompter:setFontSize', size),
});
