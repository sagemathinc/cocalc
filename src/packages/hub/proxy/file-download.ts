import { readFile as readProjectFile } from "@cocalc/conat/files/read";
import { once } from "events";
import { path_split } from "@cocalc/util/misc";
import mime from "mime-types";
import getLogger from "../logger";

const DANGEROUS_CONTENT_TYPE = new Set(["image/svg+xml" /*, "text/html"*/]);

const logger = getLogger("hub:proxy:file-download");

// assumes request has already been authenticated!

export async function handleFileDownload(req, res, url, project_id) {
  logger.debug("handling the request via conat file streaming", url);
  const i = url.indexOf("files/");
  const compute_server_id = req.query.id ?? 0;
  let j = url.lastIndexOf("?");
  if (j == -1) {
    j = url.length;
  }
  const path = decodeURIComponent(url.slice(i + "files/".length, j));
  logger.debug("conat: get file", { project_id, path, compute_server_id, url });
  const fileName = path_split(path).tail;
  const contentType = mime.lookup(fileName);
  if (req.query.download != null || DANGEROUS_CONTENT_TYPE.has(contentType)) {
    const fileNameEncoded = encodeURIComponent(fileName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, "%2A");
    res.setHeader(
      "Content-disposition",
      `attachment; filename*=UTF-8''${fileNameEncoded}`,
    );
  }
  res.setHeader("Content-type", contentType);

  let headersSent = false;
  res.on("finish", () => {
    headersSent = true;
  });
  try {
    for await (const chunk of await readProjectFile({
      project_id,
      compute_server_id,
      path,
      // allow a long download time (1 hour), since files can be large and
      // networks can be slow.
      maxWait: 1000 * 60 * 60,
    })) {
      if (res.writableEnded || res.destroyed) {
        break;
      }
      if (!res.write(chunk)) {
        await once(res, "drain");
      }
    }
    res.end();
  } catch (err) {
    logger.debug(
      "ERROR streaming file",
      { project_id, compute_server_id, path },
      err,
    );
    if (!headersSent) {
      res.statusCode = 500;
      res.end("Error reading file.");
    } else {
      // Data sent, forcibly kill the connection
      res.destroy(err);
    }
  }
}
