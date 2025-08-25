import express, { type Application } from "express";
import { path as STATIC_PATH } from "@cocalc/static";
import { path as ASSET_PATH } from "@cocalc/assets";
import getPort from "@cocalc/backend/get-port";
import { createServer as httpCreateServer } from "http";
import getLogger from "@cocalc/backend/logger";
import port0 from "@cocalc/backend/port";
import { once } from "node:events";
import { PROJECT_ID } from "./const";
import { handleFileDownload } from "@cocalc/conat/files/file-download";
import { join } from "path";
import initBlobUpload from "./hub/blobs/upload";
import initBlobDownload from "./hub/blobs/download";

const logger = getLogger("lite:static");

export async function initHttpServer(): Promise<{
  httpServer: ReturnType<typeof httpCreateServer>;
  app: Application;
  port: number;
}> {
  const app = express();
  const httpServer = httpCreateServer(app);
  httpServer.on("error", (err) => {
    logger.error(
      "*".repeat(60) +
        `\nWARNING -- hub http server error: ${err.stack || err}\n` +
        "*".repeat(60),
    );
    // @ts-ignore
    if (err.code === "EADDRINUSE" || err.code == "EACCES") {
      // this means we never got the server going, so better just terminate
      console.log(err);
      process.exit(1);
    }
  });

  const port = port0 ?? (await getPort());
  httpServer.listen(port);
  await once(httpServer, "listening");

  console.log(
    "*".repeat(60) + `\n\nhttp://localhost:${port}\n\n` + "*".repeat(60),
  );
  return { httpServer, app, port };
}

export async function initApp({ app, conatClient }) {
  app.use("/static", express.static(STATIC_PATH));

  app.use(
    "/webapp/favicon.ico",
    express.static(join(ASSET_PATH, "favicon.ico")),
  );

  app.get("/customize", async (_, res) => {
    res.json({ configuration: { lite: true, site_name: "" } });
  });

  // file download
  app.get(`/${PROJECT_ID}/files/*`, async (req, res) => {
    await handleFileDownload({ req, res });
  });

  initBlobUpload(app, conatClient);
  initBlobDownload(app, conatClient);

  app.get("*", (req, res) => {
    if (req.url.endsWith("__webpack_hmr")) return;
    console.log("redirecting", req.url);
    res.redirect("/static/app.html");
  });
}
