const { app, BrowserWindow, shell, nativeTheme, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// Pass Electron's userData dir to the bridge server before requiring it
// This ensures data is saved to ~/Library/Application Support/meridian/
process.env.CDASH_USER_DATA = app.getPath('userData');

// Start bridge server
try {
  require(path.join(__dirname, 'server.js'));
  console.log('[main] bridge started');
} catch (e) {
  console.error('[main] bridge failed:', e.message);
}

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    title: 'Meridian',
    backgroundColor: '#060b18',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Trigger a save before the window closes
  mainWindow.on('close', () => {
    try { mainWindow.webContents.executeJavaScript('save()'); } catch(e){}
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Meridian');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { if (mainWindow) mainWindow.show(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Save on app quit
app.on('before-quit', () => {
  if (mainWindow) {
    try { mainWindow.webContents.executeJavaScript('save()'); } catch(e){}
  }
});

app.commandLine.appendSwitch('ignore-certificate-errors');
