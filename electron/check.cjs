const { loadDesktopConfig, validateStartUrl } = require("./config.cjs");

const config = loadDesktopConfig();
const validation = validateStartUrl(config.startUrl);

if (!validation.valid) {
  console.error(`[desktop-check] ${validation.message}`);
  process.exit(1);
}

console.log(`[desktop-check] OK: ${config.startUrl}`);
