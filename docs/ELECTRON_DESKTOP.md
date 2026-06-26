# Electron Desktop Shell

This project now includes an Electron shell that opens the deployed Capstone app in a desktop window.

## Configure the deployed URL

Edit `electron/app-config.json` and replace the placeholder `startUrl` value with your deployed frontend URL.

If you want a machine-local override without changing the tracked file, create:

`electron/app-config.local.json`

Example:

```json
{
  "startUrl": "https://your-real-deployed-app.example.com"
}
```

## Run the desktop app

```bash
npm run desktop
```

Open with DevTools:

```bash
npm run desktop:dev
```

Validate the URL config first:

```bash
npm run desktop:check
```

Create an unpacked desktop build for a quick smoke test:

```bash
npm run desktop:dir
```

## Build a Windows installer

```bash
npm run desktop:build
```

The installer output is written to the `release` folder.
