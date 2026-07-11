// Safe bridge between the web pages and the Electron main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  // control <-> presenter relay
  toPresenter: (msg) => ipcRenderer.send('to-presenter', msg),
  toControl: (msg) => ipcRenderer.send('to-control', msg),
  onFromControl: (cb) => ipcRenderer.on('from-control', (_e, msg) => cb(msg)),
  onFromPresenter: (cb) => ipcRenderer.on('from-presenter', (_e, msg) => cb(msg)),

  // screens + presenter window
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  showPresenter: (displayId) => ipcRenderer.send('show-presenter', displayId),
  hidePresenter: () => ipcRenderer.send('hide-presenter'),
  extendDisplays: () => ipcRenderer.invoke('extend-displays'),
  onDisplaysChanged: (cb) => ipcRenderer.on('displays-changed', () => cb()),
  onPresenterStatus: (cb) => ipcRenderer.on('presenter-status', (_e, s) => cb(s)),

  // persistence
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (partial) => ipcRenderer.send('save-state', partial),

  // phone remote
  getRemoteInfo: () => ipcRenderer.invoke('get-remote-info'),
  onRemoteCommand: (cb) => ipcRenderer.on('remote-command', (_e, c) => cb(c)),
});
