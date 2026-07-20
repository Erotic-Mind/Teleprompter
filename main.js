// Main process.
//   - Control window  -> your laptop (editor, operator view, buttons)
//   - Presenter window -> the Elgato Prompter screen (big mirrored scrolling text)
//
// The presenter is a BORDERLESS, always-on, non-focusable window pinned to the
// prompter's exact bounds. Not real "fullscreen" — that mode gets minimized by
// Windows when it loses focus, which froze the scroll. This stays visible and
// keeps rendering no matter where your mouse/focus is.

const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const http = require('http');
const os = require('os');

// GPU acceleration is intentionally LEFT ON. Chrome (which scrolls smoothly on the
// same DisplayLink prompter) runs GPU-on; the early working builds ran GPU-on. An
// earlier build disabled it — that was a regression, so it's removed. GPU-on + a
// normal composited window = the exact configuration Chrome uses.

let controlWin = null;
let presenterWin = null;

// --- persistence (remembers your script + settings) -------------------------

let stateCache = null;
let saveTimer = null;
const stateFile = () => path.join(app.getPath('userData'), 'prompter-state.json');

function readState() {
  if (stateCache) return stateCache;
  try {
    stateCache = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    stateCache = {};
  }
  return stateCache;
}
function writeState(partial) {
  stateCache = Object.assign(readState(), partial);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(stateCache, null, 2));
    } catch {
      /* ignore */
    }
  }, 400);
}

// --- display helpers --------------------------------------------------------

function listDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label || 'Display',
    w: d.size.width,
    h: d.size.height,
    isPrimary: d.id === primaryId,
  }));
}

// The prompter: prefer a screen literally labelled "Elgato"; else smallest external.
function guessPresenterDisplay() {
  const primaryId = screen.getPrimaryDisplay().id;
  const externals = screen.getAllDisplays().filter((d) => d.id !== primaryId);
  if (externals.length === 0) return null;
  const named = externals.find((d) => /elgato|prom/i.test(d.label || ''));
  if (named) return named;
  externals.sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height);
  return externals[0];
}

function prompterInfo() {
  const g = guessPresenterDisplay();
  return {
    visible: !!presenterWin && !presenterWin.isDestroyed() && presenterWin.isVisible(),
    hasExternal: !!g,
    label: g ? g.label || 'External display' : null,
    w: g ? g.size.width : 0,
    h: g ? g.size.height : 0,
    screenCount: screen.getAllDisplays().length,
  };
}
function sendStatus() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send('presenter-status', prompterInfo());
  }
}

// --- windows ----------------------------------------------------------------

function createControlWindow() {
  const primary = screen.getPrimaryDisplay();
  controlWin = new BrowserWindow({
    width: 1040,
    height: 800,
    minWidth: 780,
    minHeight: 580,
    x: primary.workArea.x + 40,
    y: primary.workArea.y + 30,
    title: 'Prompter — Control',
    backgroundColor: '#0c0c0e',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  controlWin.loadFile('control.html');
  controlWin.on('closed', () => {
    controlWin = null;
    if (presenterWin && !presenterWin.isDestroyed()) presenterWin.destroy();
  });
}

function createPresenterWindow(display) {
  const onExternal = !!display;
  const b = (display || screen.getPrimaryDisplay()).bounds;
  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: onExternal ? b.width : 900,
    height: onExternal ? b.height : 620,
    frame: !onExternal, // framed & draggable when we fall back to the laptop
    movable: !onExternal,
    resizable: !onExternal,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    // A normal, focusable window stays put; a non-focusable/non-topmost borderless
    // window can vanish. We never ACTIVATE it (always showInactive), so the control
    // window keeps focus and keyboard shortcuts still work.
    focusable: true,
    // NOT always-on-top: an overlay/topmost window bypasses normal desktop
    // compositing (DWM); a USB/DisplayLink display only captures the normal
    // composited desktop smoothly — exactly what a browser window (cueprompter) uses.
    alwaysOnTop: false,
    backgroundColor: '#000000',
    title: 'Prompter',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // keep animating even when unfocused
    },
  });
  win.__external = onExternal;
  // (deliberately no setAlwaysOnTop — see note above; overlay windows stutter on DisplayLink)
  win.loadFile('presenter.html');
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    if (presenterWin === win) presenterWin = null;
    sendStatus();
  });
  presenterWin = win;
  return win;
}

// Show the presenter on the best (or requested) screen, recreating the window
// if the screen type changed (external <-> laptop) since window flags are fixed
// at creation time.
function openOrMovePresenter(preferId) {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  let target = preferId != null ? displays.find((d) => d.id === preferId) : null;
  if (!target) target = guessPresenterDisplay();
  const wantExternal = !!target && target.id !== primaryId;

  if (presenterWin && presenterWin.__external !== wantExternal) {
    const old = presenterWin;
    presenterWin = null;
    old.destroy();
  }
  if (!presenterWin) {
    createPresenterWindow(wantExternal ? target : null);
  } else {
    if (wantExternal && target) presenterWin.setBounds(target.bounds);
    presenterWin.showInactive();
  }
  sendStatus();
}

// --- IPC --------------------------------------------------------------------

ipcMain.on('to-presenter', (_e, msg) => {
  if (presenterWin && !presenterWin.isDestroyed()) presenterWin.webContents.send('from-control', msg);
});
ipcMain.on('to-control', (_e, msg) => {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('from-presenter', msg);
});

ipcMain.handle('get-displays', () => listDisplays());

ipcMain.on('show-presenter', (_e, displayId) => openOrMovePresenter(displayId));
ipcMain.on('hide-presenter', () => {
  if (presenterWin && !presenterWin.isDestroyed()) presenterWin.hide();
  sendStatus();
});


ipcMain.handle('extend-displays', async () => {
  if (process.platform !== 'win32') {
    return { ok: false, out: 'On Mac, arrange displays as "Extend" in System Settings (needs the DisplayLink helper app).' };
  }
  return new Promise((resolve) => {
    tryExtend(5, (ok) =>
      resolve({ ok, out: ok ? 'Extended.' : 'Could not extend after several tries — press Win+P → Extend, or replug the prompter.' })
    );
  });
});

ipcMain.handle('load-state', () => readState());
ipcMain.on('save-state', (_e, partial) => writeState(partial));

function notifyDisplaysChanged() {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('displays-changed');
  sendStatus();
}

// Path to the extend helper — resolves correctly whether run from source or packaged.
function extendPs1Path() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'extend-displays.ps1')
    : path.join(__dirname, 'extend-displays.ps1');
}

function runExtendOnce(cb) {
  try {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', extendPs1Path()], () => cb && cb());
  } catch {
    if (cb) cb();
  }
}

// Windows-only: keep trying to extend until the prompter is actually its own
// screen (the extend call sometimes reports success but no-ops on this hardware),
// then stop. Never leaves it sitting in Duplicate.
function tryExtend(maxAttempts, done) {
  if (process.platform !== 'win32') {
    if (done) done(false);
    return;
  }
  let attempt = 0;
  const step = () => {
    if (screen.getAllDisplays().length > 1) {
      if (done) done(true);
      return;
    }
    if (attempt >= maxAttempts) {
      if (done) done(false);
      return;
    }
    attempt++;
    runExtendOnce(() => setTimeout(step, 2500));
  };
  step();
}

// (Live preview is now a lightweight DOM clone driven by an offset number the
//  presenter broadcasts — no screenshotting, so the prompter never stutters.)

// --- phone remote (tiny HTTP server on your Wi-Fi) --------------------------
let remoteServer = null;
const REMOTE_PORT = 5178;

function lanIP() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}
function remoteHtmlPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'remote.html') : path.join(__dirname, 'remote.html');
}
function startRemoteServer() {
  if (remoteServer) return;
  remoteServer = http.createServer((req, res) => {
    const parts = (req.url || '/').split('?');
    if (parts[0] === '/cmd') {
      const params = new URLSearchParams(parts[1] || '');
      const cmd = { type: params.get('type'), delta: parseInt(params.get('delta') || '0', 10) };
      if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('remote-command', cmd);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(remoteHtmlPath()));
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  remoteServer.on('error', () => { remoteServer = null; });
  remoteServer.listen(REMOTE_PORT, '0.0.0.0');
}

ipcMain.handle('get-remote-info', () => ({ url: remoteServer ? `http://${lanIP()}:${REMOTE_PORT}` : null }));

// --- app lifecycle ----------------------------------------------------------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // Keep the presenter pinned to the current prompter screen. If that screen drops
  // (DisplayLink can flap in/out), HIDE the window instead of stranding it at now-
  // off-screen coordinates — that stranding is what looked like "it comes on for a
  // second and goes away". Debounced so brief flaps don't cause churn.
  let resyncTimer = null;
  const resyncPresenter = () => {
    clearTimeout(resyncTimer);
    resyncTimer = setTimeout(() => {
      if (presenterWin && !presenterWin.isDestroyed()) {
        const target = guessPresenterDisplay();
        if (target) {
          presenterWin.setBounds(target.bounds);
          if (!presenterWin.isVisible()) presenterWin.showInactive();
        } else if (presenterWin.isVisible()) {
          presenterWin.hide();
        }
      }
      notifyDisplaysChanged();
    }, 400);
  };
  screen.on('display-added', () => { if (guessPresenterDisplay()) openOrMovePresenter(); resyncPresenter(); });
  screen.on('display-removed', resyncPresenter);
  screen.on('display-metrics-changed', resyncPresenter);

  createControlWindow();
  startRemoteServer();

  // On Windows, if the prompter is only mirroring (one screen), extend the desktop
  // automatically so the text gets its own screen — no button needed. The
  // display-added event then auto-shows the presenter on it.
  if (process.platform === 'win32' && screen.getAllDisplays().length === 1) {
    tryExtend(5);
  }

  // Auto-open the presenter on a real second screen if one exists.
  if (guessPresenterDisplay()) {
    openOrMovePresenter();
  }
  controlWin.webContents.once('did-finish-load', sendStatus);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

app.on('window-all-closed', () => app.quit());
