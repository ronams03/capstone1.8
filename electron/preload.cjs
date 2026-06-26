const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("capstoneDesktop", {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
});
