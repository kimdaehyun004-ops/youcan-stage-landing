const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prompterAPI', {
  onShow: (callback) => ipcRenderer.on('prompter:show', (_event, song) => callback(song)),
  onClear: (callback) => ipcRenderer.on('prompter:clear', () => callback()),
  onFontSize: (callback) => ipcRenderer.on('prompter:fontSize', (_event, size) => callback(size)),
  toggleFullscreen: () => ipcRenderer.send('prompter:toggleFullscreen'),
});
