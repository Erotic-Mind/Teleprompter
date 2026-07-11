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
    skipTaskbar: onExternal,
    focusable: !onExternal ? true : false, // borderless prompter never grabs focus
    alwaysOnTop: onExternal,
    backgroundColor: '#000000',
    title: 'Prompter',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // keep animating even when unfocused
    },
  });
  win.__external = onExternal;
  if (onExternal) win.setAlwaysOnTop(true, 'screen-saver');
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

// --- app lifecycle ----------------------------------------------------------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // When the prompter becomes its own screen, put the presenter on it automatically.
  screen.on('display-added', () => {
    notifyDisplaysChanged();
    if (guessPresenterDisplay()) openOrMovePresenter();
  });
  screen.on('display-removed', notifyDisplaysChanged);
  screen.on('display-metrics-changed', notifyDisplaysChanged);

  createControlWindow();

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
