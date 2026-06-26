const fs = require("node:fs");
const path = require("node:path");

const PLACEHOLDER_START_URL = "https://your-deployed-app.example.com";

const DEFAULT_CONFIG = {
  appName: "Capstone1 Desktop",
  startUrl: PLACEHOLDER_START_URL,
  window: {
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#0f172a",
  },
};

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      __error: `Could not read ${path.basename(filePath)}: ${error.message}`,
    };
  }
}

function asPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveWindowConfig(windowConfig = {}) {
  return {
    width: asPositiveInteger(windowConfig.width, DEFAULT_CONFIG.window.width),
    height: asPositiveInteger(windowConfig.height, DEFAULT_CONFIG.window.height),
    minWidth: asPositiveInteger(windowConfig.minWidth, DEFAULT_CONFIG.window.minWidth),
    minHeight: asPositiveInteger(windowConfig.minHeight, DEFAULT_CONFIG.window.minHeight),
    backgroundColor:
      typeof windowConfig.backgroundColor === "string" && windowConfig.backgroundColor.trim()
        ? windowConfig.backgroundColor.trim()
        : DEFAULT_CONFIG.window.backgroundColor,
  };
}

function loadDesktopConfig() {
  const baseConfigPath = path.join(__dirname, "app-config.json");
  const localConfigPath = path.join(__dirname, "app-config.local.json");

  const baseConfig = readJsonFile(baseConfigPath) || {};
  const localConfig = readJsonFile(localConfigPath) || {};

  const loadError = baseConfig.__error || localConfig.__error || "";

  const merged = {
    appName:
      typeof localConfig.appName === "string" && localConfig.appName.trim()
        ? localConfig.appName.trim()
        : typeof baseConfig.appName === "string" && baseConfig.appName.trim()
          ? baseConfig.appName.trim()
          : DEFAULT_CONFIG.appName,
    startUrl:
      typeof localConfig.startUrl === "string" && localConfig.startUrl.trim()
        ? localConfig.startUrl.trim()
        : typeof baseConfig.startUrl === "string" && baseConfig.startUrl.trim()
          ? baseConfig.startUrl.trim()
          : DEFAULT_CONFIG.startUrl,
    window: resolveWindowConfig({
      ...DEFAULT_CONFIG.window,
      ...(baseConfig.window || {}),
      ...(localConfig.window || {}),
    }),
    loadError,
    sourceFiles: {
      baseConfigPath,
      localConfigPath,
    },
  };

  return merged;
}

function validateStartUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return {
      valid: false,
      message: "Desktop start URL is empty. Update electron/app-config.json or electron/app-config.local.json.",
    };
  }

  if (raw === PLACEHOLDER_START_URL) {
    return {
      valid: false,
      message: "Desktop start URL is still the placeholder. Replace it with your deployed app URL.",
    };
  }

  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        message: "Desktop start URL must use http or https.",
      };
    }

    return {
      valid: true,
      message: "",
      url: parsed.toString(),
      origin: parsed.origin,
    };
  } catch {
    return {
      valid: false,
      message: "Desktop start URL is not a valid URL.",
    };
  }
}

module.exports = {
  DEFAULT_CONFIG,
  PLACEHOLDER_START_URL,
  loadDesktopConfig,
  validateStartUrl,
};
