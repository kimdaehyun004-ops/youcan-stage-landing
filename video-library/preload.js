const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  version: () => ipcRenderer.invoke('app:version'),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addFolders: () => ipcRenderer.invoke('folders:add'),
  removeFolder: (folder) => ipcRenderer.invoke('folders:remove', folder),
  addPaths: (paths, groupId) => ipcRenderer.invoke('paths:add', paths, groupId),
  saveGroups: (groups) => ipcRenderer.invoke('groups:save', groups),
  setMeta: (file, patch) => ipcRenderer.invoke('meta:set', file, patch),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  saveThumb: (key, dataUrl) => ipcRenderer.invoke('thumb:save', key, dataUrl),
  ffmpegStrip: (file, key) => ipcRenderer.invoke('thumb:ffmpeg', file, key),
  makeProxy: (file, key, duration) => ipcRenderer.invoke('proxy:make', file, key, duration),
  onProxyProgress: (cb) => ipcRenderer.on('proxy:progress', (_e, key, pct) => cb(key, pct)),
  startDrag: (files, iconDataUrl) => ipcRenderer.send('drag:start', files, iconDataUrl),
  reveal: (file) => ipcRenderer.invoke('file:reveal', file),
  open: (file) => ipcRenderer.invoke('file:open', file),
  copyPaths: (files) => ipcRenderer.invoke('file:copyPath', files),
  exportFiles: (files, name) => ipcRenderer.invoke('files:export', files, name),
  confirm: (message, detail) => ipcRenderer.invoke('confirm', message, detail),
  // 드롭된 File 객체의 실제 디스크 경로 (Electron 32+ 에서는 File.path 가 없어짐)
  pathForFile: (file) => webUtils.getPathForFile(file),
  platform: process.platform,
});
