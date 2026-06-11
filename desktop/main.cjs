/**
 * GuruCMS Desktop — hybrid Electron shell.
 * Bundled local UI (webapp/) + cloud API on Render (agents/cron keep running when closed).
 */
const { app, BrowserWindow, shell, nativeImage, Menu } = require('electron');
const path = require('path');

const CLOUD_URL = (process.env.PATHGURU_CLOUD_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
const DEFAULT_PRODUCT = process.env.PATHGURU_PRODUCT || 'digifusion';
const USE_CLOUD_UI = process.env.PATHGURU_DESKTOP_CLOUD === '1';

const WEBAPP_INDEX = path.join(__dirname, '..', 'webapp', 'index.html');
const APP_ICON = path.join(__dirname, 'icon.png');

function buildLoadUrl() {
  const qs = new URLSearchParams();
  qs.set('desktop', '1');
  if (DEFAULT_PRODUCT) qs.set('product', DEFAULT_PRODUCT);
  const query = qs.toString();

  if (USE_CLOUD_UI) {
    return query ? `${CLOUD_URL}/?${query}` : `${CLOUD_URL}/`;
  }

  const filePath = WEBAPP_INDEX.replace(/\\/g, '/');
  return `file:///${filePath}${query ? `?${query}` : ''}`;
}

function getAppIcon() {
  try {
    const img = nativeImage.createFromPath(APP_ICON);
    return img.isEmpty() ? undefined : img;
  } catch {
    return undefined;
  }
}

function createWindow() {
  const icon = getAppIcon();

  const win = new BrowserWindow({
    width:     1440,
    height:    900,
    minWidth:  1024,
    minHeight: 680,
    title:     'GuruCMS',
    backgroundColor: '#0d0f14',
    icon,
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(buildLoadUrl());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.PATHGURU_DESKTOP_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.gurucms.command');
}

app.setName('GuruCMS');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  function buildAppMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          { role: 'quit', label: 'Quit GuruCMS' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload', label: 'Reload' },
          { role: 'forceReload', label: 'Force Reload' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'GuruCMS Cloud',
            click: () => shell.openExternal(CLOUD_URL),
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  app.whenReady().then(() => {
    buildAppMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
