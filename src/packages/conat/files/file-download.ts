import { readFile } from "./read";
import { once } from "events";
import { path_split } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/conat/client";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import mime from "mime-types";

const DANGEROUS_CONTENT_TYPE = new Set(["image/svg+xml" /*, "text/html"*/]);

const logger = getLogger("conat:file-download");

// assumes request has already been authenticated!

export async function handleFileDownload({
  req,
  res,
  url,
  allowUnsafe,
  client,
  // allow a long download time (1 hour), since files can be large and
  // networks can be slow.
  maxWait = 1000 * 60 * 60,
}: {
  req;
  res;
  url?: string;
  allowUnsafe?: boolean;
  client?: ConatClient;
  maxWait?: number;
}) {
  url ??= req.url;
  logger.debug("downloading file from project to browser", url);
  if (!url) {
    res.statusCode = 500;
    res.end("Invalid URL");
    return;
  }
  const i = url.indexOf("files/");
  const compute_server_id = parseInt(req.query.id ?? "0");
  let j = url.lastIndexOf("?");
  if (j == -1) {
    j = url.length;
  }
  const path = decodeURIComponent(url.slice(i + "files/".length, j));
  const project_id = url.split("/").slice(1)[0];
  logger.debug("conat: get file", { project_id, path, compute_server_id, url });
  const fileName = path_split(path).tail;
  const contentType = mime.lookup(fileName);
  if (
    req.query.download != null ||
    (!allowUnsafe && DANGEROUS_CONTENT_TYPE.has(contentType))
  ) {
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
    for await (const chunk of await readFile({
      client,
      project_id,
      compute_server_id,
      path,
      maxWait,
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
