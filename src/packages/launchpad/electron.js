// Electron entrypoint for CoCalc Launchpad (desktop). Spins up the Hub
// control plane and opens a browser window pointed at the local server.
const { app, BrowserWindow, Menu } = require("electron");
const { applyLaunchpadDefaults, logLaunchpadConfig } = require("./lib/onprem-config");

let port; // set after Launchpad starts

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
  });
  win.loadURL(`http://localhost:${port}`);
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    // App menu (macOS)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+N",
          click: () => createWindow(),
        },
        { type: "separator" },
        ...(isMac ? [{ role: "close" }] : [{ role: "quit" }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "window",
      submenu: [{ role: "minimize" }, { role: "zoom" }],
    },
    {
      role: "help",
      submenu: [],
    },
  ];

  return Menu.buildFromTemplate(template);
}

async function main() {
  // Spin up CoCalc Launchpad and Electron
  applyLaunchpadDefaults();
  logLaunchpadConfig();

  await app.whenReady();
  require("@cocalc/hub/hub");
  port = process.env.PORT;
  console.log("app ready and launchpad started on port", port);

  // Menu + initial window
  Menu.setApplicationMenu(buildMenu());
  createWindow();

  // macOS: recreate window when dock icon is clicked and there are none
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Quit on all windows closed, except macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

main();
