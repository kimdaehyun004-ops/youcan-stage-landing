const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const SongStore = require('./store');

let consoleWin = null;
let prompterWin = null;
let store = null;

function pickDisplays() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find((d) => d.id !== primary.id) || null;
  return { primary, secondary, hasSecondary: Boolean(secondary) };
}

function createConsoleWindow(primary) {
  consoleWin = new BrowserWindow({
    width: 1080,
    height: 720,
    x: primary.workArea.x + 40,
    y: primary.workArea.y + 40,
    title: '가사 프롬프터 - 콘솔',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'console', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  consoleWin.loadFile(path.join(__dirname, 'console', 'index.html'));
  consoleWin.on('closed', () => {
    consoleWin = null;
    app.quit();
  });
}

function createPrompterWindow({ secondary, hasSecondary, primary }) {
  const target = hasSecondary ? secondary : primary;

  prompterWin = new BrowserWindow({
    x: target.bounds.x + (hasSecondary ? 0 : 60),
    y: target.bounds.y + (hasSecondary ? 0 : 60),
    width: hasSecondary ? target.bounds.width : 900,
    height: hasSecondary ? target.bounds.height : 560,
    frame: !hasSecondary,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: '가사 프롬프터',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'prompter', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  prompterWin.loadFile(path.join(__dirname, 'prompter', 'index.html'));

  prompterWin.once('ready-to-show', () => {
    prompterWin.show();
    if (hasSecondary) {
      prompterWin.setFullScreen(true);
    }
  });

  prompterWin.on('closed', () => {
    prompterWin = null;
  });
}

function createWindows() {
  const displayInfo = pickDisplays();
  createConsoleWindow(displayInfo.primary);
  createPrompterWindow(displayInfo);
}

app.whenReady().then(() => {
  store = new SongStore();
  createWindows();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: song CRUD ---
ipcMain.handle('songs:getAll', () => store.getAll());
ipcMain.handle('songs:add', (_event, song) => store.add(song));
ipcMain.handle('songs:update', (_event, id, patch) => store.update(id, patch));
ipcMain.handle('songs:delete', (_event, id) => store.remove(id));

// --- IPC: prompter control ---
ipcMain.handle('prompter:load', (_event, id) => {
  const song = store.getById(id);
  if (song && prompterWin) {
    prompterWin.webContents.send('prompter:show', song);
  }
  return song;
});

ipcMain.handle('prompter:clear', () => {
  if (prompterWin) prompterWin.webContents.send('prompter:clear');
});

ipcMain.handle('prompter:setFontSize', (_event, size) => {
  if (prompterWin) prompterWin.webContents.send('prompter:fontSize', size);
});

ipcMain.on('prompter:toggleFullscreen', () => {
  if (prompterWin) prompterWin.setFullScreen(!prompterWin.isFullScreen());
});
