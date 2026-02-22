"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const createWindow = () => {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0f0f0f',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development') {
        win.loadURL(devUrl);
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
};
electron_1.ipcMain.handle('capture-screen', async () => {
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const targetWidth = Math.max(1280, Math.floor(primaryDisplay.size.width * 0.75));
    const targetHeight = Math.max(720, Math.floor(primaryDisplay.size.height * 0.75));
    const sources = await electron_1.desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: targetWidth, height: targetHeight }
    });
    const source = sources[0];
    if (!source)
        return null;
    const jpeg = source.thumbnail.toJPEG(72);
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
});
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
