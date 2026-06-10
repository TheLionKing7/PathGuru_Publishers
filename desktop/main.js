/**
 * PathGuru hybrid desktop — thin Electron shell loading the cloud webapp.
 * Agents and cron keep running on Render when this window is closed.
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const CLOUD_URL = (process.env.PATHGURU_CLOUD_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
const DEFAULT_PRODUCT = process.env.PATHGURU_PRODUCT || 'digifusion';
// Default: bundled local webapp + Render API (via preload). Set PATHGURU_DESKTOP_CLOUD=1 to load cloud UI.
const USE_CLOUD_UI = process.env.PATHGURU_DESKTOP_CLOUD === '1';

function buildLoadUrl() {
  if (!USE_CLOUD_UI) {
    return `file://${path.join(__dirname, '..', 'webapp', 'index.html')}`;
  }
  const qs = new URLSearchParams();
  if (DEFAULT_PRODUCT) qs.set('product', DEFAULT_PRODUCT);
  qs.set('desktop', '1');
  const query = qs.toString();
  return query ? `${CLOUD_URL}/?${query}` : `${CLOUD_URL}/`;
}

function createWindow() {
  const win = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  1024,
    minHeight: 680,
    title: 'PathGuru Platform',
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  win.loadURL(buildLoadUrl());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.PATHGURU_DESKTOP_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
