const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeImage, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { Readable } = require('stream');
const { execFile, spawnSync } = require('child_process');

const VIDEO_EXT = new Set([
  '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.wmv', '.mts', '.m2ts', '.ts',
  '.mpg', '.mpeg', '.3gp', '.flv', '.ogv', '.mxf',
]);
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.jpg': 'image/jpeg',
};

// 영상/썸네일을 렌더러에 스트리밍하는 전용 스킴. 동일 출처(CORS)로 제공해야
// 캔버스로 썸네일을 뽑을 수 있고, Range 요청을 지원해야 탐색(스크럽)이 된다.
protocol.registerSchemesAsPrivileged([
  { scheme: 'vlib', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

// 포터블 exe 로 실행하면 그룹·썸네일 데이터를 exe 옆 폴더에 저장 (폴더째 옮겨도 그대로 유지)
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, '영상 라이브러리 데이터'));
}

let win;
let dataDir, thumbDir, libraryFile;
let library = { folders: [], groups: [], meta: {}, settings: {} };

// ---------- 저장소 ----------
async function loadLibrary() {
  try {
    const raw = await fsp.readFile(libraryFile, 'utf8');
    library = { ...library, ...JSON.parse(raw) };
  } catch { /* 첫 실행 */ }
}

let saveTimer = null;
function saveLibrary() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const tmp = libraryFile + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(library, null, 1));
    await fsp.rename(tmp, libraryFile);
  }, 300);
}

function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  fs.writeFileSync(libraryFile, JSON.stringify(library, null, 1));
}

// ---------- 스캔 ----------
async function walk(dir, out) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

function thumbKey(file, st) {
  return crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex');
}

function mediaUrl(file) {
  return 'vlib://file/' + encodeURIComponent(file);
}

async function describe(file, folder) {
  let st;
  try { st = await fsp.stat(file); } catch { return null; }
  const key = thumbKey(file, st);
  const thumbPath = path.join(thumbDir, key + '.jpg');
  const hasThumb = fs.existsSync(thumbPath);
  const stripPath = path.join(thumbDir, key + '.strip.jpg');
  return {
    strip: fs.existsSync(stripPath) ? mediaUrl(stripPath) : null,
    path: file,
    name: path.basename(file),
    ext: path.extname(file).slice(1).toLowerCase(),
    dir: path.dirname(file),
    folder,
    size: st.size,
    mtime: st.mtimeMs,
    key,
    url: mediaUrl(file),
    thumb: hasThumb ? mediaUrl(thumbPath) : null,
    thumbPath: hasThumb ? thumbPath : null,
  };
}

async function scanAll() {
  const seen = new Map();
  for (const folder of library.folders) {
    const files = [];
    await walk(folder, files);
    for (const f of files) if (!seen.has(f)) seen.set(f, folder);
  }
  // 폴더 밖에서 개별로 끌어다 넣은 영상도 그룹에 들어 있으면 보여준다
  for (const g of library.groups) {
    for (const f of g.items) if (!seen.has(f) && fs.existsSync(f)) seen.set(f, null);
  }
  const items = await Promise.all([...seen].map(([f, folder]) => describe(f, folder)));
  return items.filter(Boolean);
}

// ---------- ffmpeg 필름스트립 ----------
// 크로미움이 못 읽는 코덱(ProRes, 일부 HEVC, AVI, MXF 등)은 ffmpeg 로 프레임 10장을
// 한 줄로 이어 붙인 이미지를 만들어, 마우스 위치에 따라 넘겨 보는 방식으로 미리본다.
const STRIP_FRAMES = 10;
let ffmpegPath;

function findFfmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath;
  const candidates = [];
  try { candidates.push(require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')); } catch { /* 선택 사항 */ }
  candidates.push('ffmpeg');
  ffmpegPath = candidates.find((c) => {
    try { return spawnSync(c, ['-version'], { timeout: 5000 }).status === 0; } catch { return false; }
  }) || null;
  return ffmpegPath;
}

function run(bin, args, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stderr: String(stderr) });
    });
  });
}

async function ffmpegStrip(file, key) {
  const ff = findFfmpeg();
  if (!ff) return null;
  const info = await run(ff, ['-hide_banner', '-i', file], 20000);
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info.stderr);
  const r = /Stream #.*?Video:.*?(\d{2,5})x(\d{2,5})/.exec(info.stderr);
  if (!r) return null;
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const width = Number(r[1]), height = Number(r[2]);

  const out = path.join(thumbDir, key + '.strip.jpg');
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  const filters = [];
  for (let i = 0; i < STRIP_FRAMES; i++) {
    const t = duration ? (duration * (i + 0.5)) / STRIP_FRAMES : 0;
    args.push('-ss', t.toFixed(2), '-i', file);
    filters.push(`[${i}:v:0]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=end_frame=1[f${i}]`);
  }
  const labels = Array.from({ length: STRIP_FRAMES }, (_, i) => `[f${i}]`).join('');
  args.push('-filter_complex', `${filters.join(';')};${labels}hstack=inputs=${STRIP_FRAMES}`, '-frames:v', '1', '-q:v', '4', out);
  const res = await run(ff, args, 120000);
  if (!res.ok || !fs.existsSync(out)) return null;
  return { duration, width, height, strip: mediaUrl(out) };
}

// ---------- 스트리밍 ----------
function allowedFile(file) {
  const ext = path.extname(file).toLowerCase();
  return VIDEO_EXT.has(ext) || (ext === '.jpg' && path.dirname(file) === thumbDir);
}

async function handleMedia(request) {
  const url = new URL(request.url);
  const file = decodeURIComponent(url.pathname.slice(1));
  if (!allowedFile(file)) return new Response('forbidden', { status: 403 });
  let st;
  try { st = await fsp.stat(file); } catch { return new Response('not found', { status: 404 }); }

  const type = MIME[path.extname(file).toLowerCase()] || 'video/mp4';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };
  const range = request.headers.get('range');
  let start = 0, end = st.size - 1, status = 200;
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    if (m[1] === '' && m[2] !== '') { start = Math.max(0, st.size - Number(m[2])); }
    else { start = Number(m[1] || 0); if (m[2]) end = Math.min(Number(m[2]), end); }
    if (start > end || start >= st.size) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${st.size}` } });
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  const stream = Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(stream, { status, headers });
}

// ---------- 창 ----------
function createWindow() {
  const bounds = library.settings.bounds || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#15161a',
    title: '영상 라이브러리',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', () => {
    library.settings.bounds = win.getBounds();
    saveLibrary();
    flushSave();
  });
  // 창 안으로 파일을 떨어뜨려도 페이지가 이동하지 않도록
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// ---------- IPC ----------
function groupById(id) {
  return library.groups.find((g) => g.id === id);
}

function registerIpc() {
  ipcMain.handle('library:get', async () => ({
    folders: library.folders,
    groups: library.groups,
    meta: library.meta,
    settings: library.settings,
    items: await scanAll(),
  }));

  ipcMain.handle('folders:add', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '영상이 들어 있는 폴더 선택',
      properties: ['openDirectory', 'multiSelections'],
    });
    if (r.canceled) return false;
    for (const f of r.filePaths) if (!library.folders.includes(f)) library.folders.push(f);
    saveLibrary();
    return true;
  });

  ipcMain.handle('folders:remove', (_e, folder) => {
    library.folders = library.folders.filter((f) => f !== folder);
    saveLibrary();
  });

  // 탐색기에서 끌어온 경로들: 폴더면 감시 폴더로, 파일이면 개별 항목으로 (선택 시 그룹에도)
  ipcMain.handle('paths:add', async (_e, paths, groupId) => {
    const files = [];
    for (const p of paths) {
      let st;
      try { st = await fsp.stat(p); } catch { continue; }
      if (st.isDirectory()) {
        if (!groupId && !library.folders.includes(p)) library.folders.push(p);
        if (groupId) await walk(p, files);
      } else if (VIDEO_EXT.has(path.extname(p).toLowerCase())) {
        files.push(p);
      }
    }
    const g = groupId ? groupById(groupId) : null;
    if (g) {
      for (const f of files) if (!g.items.includes(f)) g.items.push(f);
    } else if (files.length) {
      // 감시 폴더 밖의 파일은 '가져온 영상' 그룹에 보관
      let inbox = library.groups.find((x) => x.inbox);
      if (!inbox) {
        inbox = { id: 'inbox', name: '가져온 영상', color: '#8a8f98', items: [], inbox: true };
        library.groups.unshift(inbox);
      }
      for (const f of files) if (!inbox.items.includes(f)) inbox.items.push(f);
    }
    saveLibrary();
    return files.length;
  });

  ipcMain.handle('groups:save', (_e, groups) => {
    library.groups = groups;
    saveLibrary();
  });

  ipcMain.handle('meta:set', (_e, file, patch) => {
    library.meta[file] = { ...(library.meta[file] || {}), ...patch };
    saveLibrary();
  });

  ipcMain.handle('settings:set', (_e, patch) => {
    library.settings = { ...library.settings, ...patch };
    saveLibrary();
  });

  ipcMain.handle('thumb:save', async (_e, key, dataUrl) => {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const p = path.join(thumbDir, key + '.jpg');
    await fsp.writeFile(p, buf);
    return { thumb: mediaUrl(p), thumbPath: p };
  });

  ipcMain.handle('thumb:ffmpeg', (_e, file, key) => ffmpegStrip(file, key));

  // 편집 프로그램(프리미어, 다빈치, 파이널컷 등)으로 실제 파일을 끌어다 놓는 OS 드래그
  ipcMain.on('drag:start', (e, files, iconDataUrl) => {
    const existing = files.filter((f) => fs.existsSync(f));
    if (!existing.length) return;
    let icon = iconDataUrl ? nativeImage.createFromDataURL(iconDataUrl) : null;
    if (!icon || icon.isEmpty()) icon = nativeImage.createFromDataURL(FALLBACK_ICON);
    e.sender.startDrag({ file: existing[0], files: existing, icon });
  });

  ipcMain.handle('file:reveal', (_e, file) => shell.showItemInFolder(file));
  ipcMain.handle('file:open', (_e, file) => shell.openPath(file));
  ipcMain.handle('file:copyPath', (_e, files) => clipboard.writeText(files.join('\n')));

  ipcMain.handle('files:export', async (_e, files, suggestedName) => {
    const r = await dialog.showOpenDialog(win, {
      title: `"${suggestedName}" 영상을 복사할 폴더 선택`,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled) return 0;
    let n = 0;
    for (const f of files) {
      const dest = path.join(r.filePaths[0], path.basename(f));
      if (fs.existsSync(dest)) continue;
      try { await fsp.copyFile(f, dest); n++; } catch { /* 건너뜀 */ }
    }
    shell.openPath(r.filePaths[0]);
    return n;
  });

  ipcMain.handle('confirm', async (_e, message, detail) => {
    const r = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['확인', '취소'], defaultId: 0, cancelId: 1, message, detail,
    });
    return r.response === 0;
  });
}

// 회색 필름 아이콘 (썸네일이 아직 없을 때 드래그 이미지)
const FALLBACK_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAYAAABOzvzpAAAAiElEQVR4nO3ZoQ2AMBQAUYZAMBECzf4LsASqAjx5BE5c8pNfcbnWdVq3/fgz0xjmeblwP/jVfQG0gN4X4H7wbxRAC2gKoAU0BdACmgJoAU0BtICmAFpAUwAtoCmAFtAUQAtoCqAFNAXQApoCaAFNAbSApgBaQNPvsL4BTQHG8NYn+vS+AFpA70+dMHMAdudGWwAAAABJRU5ErkJggg==';

app.whenReady().then(async () => {
  dataDir = app.getPath('userData');
  thumbDir = path.join(dataDir, 'thumbs');
  libraryFile = path.join(dataDir, 'library.json');
  await fsp.mkdir(thumbDir, { recursive: true });
  await loadLibrary();
  protocol.handle('vlib', handleMedia);
  registerIpc();
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => {
  flushSave();
  if (process.platform !== 'darwin') app.quit();
});
