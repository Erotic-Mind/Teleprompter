// Browser shim: lets the SAME pages run as a plain website (no Electron).
// The control page and the prompter window talk over a BroadcastChannel; the
// script + settings persist in localStorage. Loaded only when window.api is
// missing (i.e. in a real browser, not inside Electron).
(function () {
  document.documentElement.classList.add('web-mode');
  const channel = new BroadcastChannel('prompter-app');
  const toControlCbs = [];   // onFromPresenter — messages addressed to the control page
  const toPresenterCbs = []; // onFromControl  — messages addressed to the prompter page
  const statusCbs = [];
  let presenterWin = null;
  let presenterOpen = false;

  channel.onmessage = (e) => {
    const d = e.data || {};
    if (d.to === 'control') toControlCbs.forEach((cb) => cb(d.msg));
    if (d.to === 'presenter') toPresenterCbs.forEach((cb) => cb(d.msg));
  };

  const status = () => ({ visible: presenterOpen, web: true, hasExternal: false, label: 'prompter window', w: 0, h: 0, screenCount: 1 });
  const emitStatus = () => statusCbs.forEach((cb) => cb(status()));

  setInterval(() => {
    if (presenterWin && presenterWin.closed) {
      presenterWin = null;
      if (presenterOpen) { presenterOpen = false; emitStatus(); }
    }
  }, 700);

  window.api = {
    platform: 'web',
    toPresenter: (msg) => channel.postMessage({ to: 'presenter', msg }),
    toControl: (msg) => channel.postMessage({ to: 'control', msg }),
    onFromControl: (cb) => toPresenterCbs.push(cb),
    onFromPresenter: (cb) => toControlCbs.push(cb),
    getDisplays: async () => [],
    showPresenter: () => {
      if (presenterWin && !presenterWin.closed) presenterWin.focus();
      else presenterWin = window.open('presenter.html', 'prompterWindow', 'width=1024,height=600');
      presenterOpen = !!presenterWin;
      emitStatus();
    },
    hidePresenter: () => {
      if (presenterWin && !presenterWin.closed) presenterWin.close();
      presenterWin = null;
      presenterOpen = false;
      emitStatus();
    },
    extendDisplays: async () => ({ ok: false, out: 'web' }),
    onDisplaysChanged: () => {},
    setPreviewActive: () => {},
    onPreviewFrame: () => {},
    onPresenterStatus: (cb) => { statusCbs.push(cb); setTimeout(() => cb(status()), 0); },
    loadState: async () => { try { return JSON.parse(localStorage.getItem('prompter-state') || '{}'); } catch { return {}; } },
    saveState: (partial) => {
      let cur = {};
      try { cur = JSON.parse(localStorage.getItem('prompter-state') || '{}'); } catch {}
      localStorage.setItem('prompter-state', JSON.stringify(Object.assign(cur, partial)));
    },
  };

  // Prompter-window extras: show the cursor + click anywhere to toggle fullscreen.
  window.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('stage');
    if (!stage) return; // control page — nothing to do
    document.body.style.cursor = 'default';
    const hint = document.getElementById('hint');
    if (hint) hint.innerHTML = 'Drag this window onto your prompter screen,<br />then click anywhere to go fullscreen. (Esc exits.)';
    stage.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    });
  });
})();
