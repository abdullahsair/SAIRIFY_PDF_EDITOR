const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'SAIRIFY PDF Editor - Professional Edition',
    backgroundColor: '#0e1014',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allows smooth local PDF loading
    },
    autoHideMenuBar: true
  });

  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
