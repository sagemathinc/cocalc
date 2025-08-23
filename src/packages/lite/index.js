const { app, BrowserWindow } = require("electron");

async function main() {
  process.env.PORT ??= await require("@cocalc/backend/get-port").default();
  const { join } = require("path");
  process.env.COCALC_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
  process.env.COMPUTE_SERVER_ID = "0";
  process.env.DATA = join(process.cwd(), ".cocalc");
  const startCoCalcLite = require("@cocalc/lite/main").main;
  const v = await Promise.all([app.whenReady(), startCoCalcLite()]);
  const port = v[1];
  console.log("app ready and cocalc started on port ", port);

  const createWindow = () => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
    });

    win.loadURL(`http://localhost:${port}`);
  };
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

main();
