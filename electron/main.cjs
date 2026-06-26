const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { loadDesktopConfig, validateStartUrl } = require("./config.cjs");

let mainWindow = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildStatusPage(title, message, details = []) {
  const detailItems = details
    .filter(Boolean)
    .map((detail) => `<li>${escapeHtml(detail)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", system-ui, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
        color: #e2e8f0;
        padding: 24px;
      }
      main {
        width: min(720px, 100%);
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 18px;
        box-shadow: 0 24px 64px rgba(2, 6, 23, 0.5);
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        margin: 0 0 16px;
        line-height: 1.65;
        color: #cbd5e1;
      }
      ul {
        margin: 0;
        padding-left: 20px;
        color: #94a3b8;
        line-height: 1.65;
      }
      code {
        font-family: Consolas, "Courier New", monospace;
        color: #f8fafc;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detailItems ? `<ul>${detailItems}</ul>` : ""}
    </main>
  </body>
</html>`;
}

function isAllowedNavigation(url, allowedOrigin) {
  try {
    const parsed = new URL(url);
    return parsed.origin === allowedOrigin;
  } catch {
    return false;
  }
}

function showConfigPage(windowRef, config, validation) {
  const details = [
    config.loadError || "",
    `Update ${config.sourceFiles.localConfigPath} to override the tracked config.`,
    `Or edit ${config.sourceFiles.baseConfigPath} directly.`,
    "Then restart the desktop app.",
  ].filter(Boolean);

  return windowRef.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(
      buildStatusPage("Desktop URL Not Configured", validation.message, details),
    )}`,
  );
}

function showLoadFailurePage(windowRef, targetUrl, errorDescription) {
  const details = [
    `Target URL: ${targetUrl}`,
    `Load error: ${errorDescription || "Unknown error"}`,
    "Check that the deployed app is online and reachable from this computer.",
  ];

  return windowRef.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(
      buildStatusPage("Could Not Reach The Deployed App", "The desktop shell opened, but the remote app did not load.", details),
    )}`,
  );
}

function createMainWindow() {
  const config = loadDesktopConfig();
  const validation = validateStartUrl(config.startUrl);

  mainWindow = new BrowserWindow({
    title: config.appName,
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: config.window.backgroundColor,
    icon: path.join(__dirname, "..", "public", "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  if (!validation.valid) {
    void showConfigPage(mainWindow, config, validation);
    return;
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url, validation.origin)) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedNavigation(url, validation.origin)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || !mainWindow) return;
    if (validatedURL.startsWith("data:text/html")) return;
    void showLoadFailurePage(mainWindow, validatedURL || validation.url, `${errorDescription} (${errorCode})`);
  });

  if (process.argv.includes("--devtools")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  void mainWindow.loadURL(validation.url);
}

ipcMain.handle("desktop:open-external", async (_event, url) => {
  const value = String(url || "").trim();
  if (!value) return false;

  try {
    await shell.openExternal(value);
    return true;
  } catch {
    return false;
  }
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
