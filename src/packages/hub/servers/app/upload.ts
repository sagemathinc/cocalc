/*
Support user uploading files directly to CoCalc from their browsers.

- uploading to projects and compute servers, with full support for potentially
  very LARGE file uploads that stream via NATS.  This checks users is authenticated
  with write access.

- uploading blobs to our database.

Which of the above happens depends on query params.

NOTE:  Code for downloading files from projects/compute servers
is in the middle of packages/hub/proxy/handle-request.ts


I'm sorry the code below is so insane.  It was extremely hard to write
and involves tricky state in subtle ways all over the place, due to
how the uploads are chunked and sent in bits by Dropzone, which is absolutely
necessary due to how cloudflare works.
*/

import { Router } from "express";
import { getLogger } from "@cocalc/hub/logger";
import getAccount from "@cocalc/server/auth/get-account";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import formidable from "formidable";
import { PassThrough } from "node:stream";
import { writeFile as writeFileToProject } from "@cocalc/conat/files/write";
import { join } from "path";
import { callback } from "awaiting";

// ridiculously long -- effectively no limit.
const MAX_UPLOAD_TIME_MS = 1000 * 60 * 60 * 24 * 7;

const logger = getLogger("hub:servers:app:upload");

export default function init(router: Router) {
  router.post("/upload", async (req, res) => {
    const account_id = await getAccount(req);
    if (!account_id) {
      res.status(500).send("user must be signed in to upload files");
      return;
    }
    const { project_id, compute_server_id, path = "", ttl, blob } = req.query;
    try {
      if (blob) {
        //await handleBlobUpload({ ttl, req, res });
        console.log(ttl);
        throw Error("not implemented");
      } else {
        await handleUploadToProject({
          account_id,
          project_id,
          compute_server_id,
          path,
          req,
          res,
        });
      }
    } catch (err) {
      logger.debug("upload failed ", err);
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
}

// async function handleBlobUpload({ ttl, req, res }) {
//   throw Error("blob handling not implemented");
// }

const errors: { [key: string]: string[] } = {};
const finished: { [key: string]: { state: boolean; cb: () => void } } = {};

async function handleUploadToProject({
  account_id,
  project_id,
  compute_server_id: compute_server_id0,
  path,
  req,
  res,
}) {
  logger.debug({
    account_id,
    project_id,
    compute_server_id0,
    path,
  });

  if (
    typeof project_id != "string" ||
    !(await isCollaborator({ account_id, project_id }))
  ) {
    throw Error("user must be collaborator on project");
  }
  if (typeof compute_server_id0 != "string") {
    throw Error("compute_server_id must be given");
  }
  const compute_server_id = parseInt(compute_server_id0);
  if (typeof path != "string") {
    throw Error("path must be given");
  }
  const done = { state: false, cb: () => {} };
  let filename = "noname.txt";
  let stream: any | null = null;
  let chunkStream: any | null = null;
  const form = formidable({
    keepExtensions: true,
    hashAlgorithm: "sha1",
    // file = {"size":195,"newFilename":"649205cf239d49f350c645f00.py","originalFilename":"a (2).py","mimetype":"application/octet-stream","hash":"318c0246ae31424f9225b566e7e09bef6c8acc40"}
    fileWriteStreamHandler: (file) => {
      filename = file?.["originalFilename"] ?? "noname.txt";
      const { chunkStream: chunkStream0, totalStream } = getWriteStream({
        project_id,
        compute_server_id,
        path,
        filename,
      });
      chunkStream = chunkStream0;
      stream = totalStream;
      (async () => {
        for await (const data of chunkStream) {
          stream.write(data);
        }
        done.state = true;
        done.cb();
      })();
      return chunkStream;
    },
  });

  const [fields] = await form.parse(req);
  // console.log("form", { fields, files });
  // fields looks like this: {"dzuuid":["ce5fa828-5155-4fa0-b30a-869bd4c956a5"],"dzchunkindex":["1"],"dztotalfilesize":["10000000"],"dzchunksize":["8000000"],"dztotalchunkcount":["2"],"dzchunkbyteoffset":["8000000"]}

  // console.log({ filename, fields, path, files });

  const index = parseInt(fields.dzchunkindex?.[0] ?? "0");
  const count = parseInt(fields.dztotalchunkcount?.[0] ?? "1");
  const key = JSON.stringify({ path, filename, compute_server_id, project_id });
  if (index > 0 && errors?.[key]?.length > 0) {
    res.status(500).send(`upload failed -- ${errors[key].join(", ")}`);
    return;
  }
  if (index == 0) {
    // start brand new upload. this is the only time we clear the errors map.
    errors[key] = [];
    finished[key] = { state: false, cb: () => {} };
    // @ts-ignore
    (async () => {
      try {
        // console.log("NATS: started writing ", filename);
        await writeFileToProject({
          stream,
          project_id,
          compute_server_id,
          path: join(path, fields.fullPath?.[0] ?? filename),
          maxWait: MAX_UPLOAD_TIME_MS,
        });
        // console.log("NATS: finished writing ", filename);
      } catch (err) {
        // console.log("NATS: error ", err);
        errors[key].push(`${err}`);
      } finally {
        // console.log("NATS: freeing write stream");
        freeWriteStream({
          project_id,
          compute_server_id,
          path,
          filename,
        });
        finished[key].state = true;
        finished[key].cb();
      }
    })();
  }
  if (index == count - 1) {
    // console.log("finish");
    if (!done.state) {
      const f = (cb) => {
        done.cb = cb;
      };
      await callback(f);
    }
    stream.end();
    if (!finished[key].state) {
      const f = (cb) => {
        finished[key].cb = cb;
      };
      await callback(f);
    }
    delete finished[key];
  }
  if ((errors[key]?.length ?? 0) > 0) {
    // console.log("saying upload failed");
    let e = errors[key].join(", ");
    if (e.includes("Error: 503")) {
      e += ", Upload service not running.";
    }
    res.status(500).send(`Upload failed: ${e}`);
  } else {
    // console.log("saying upload worked");
    res.send({ status: "ok" });
  }
}

function getKey(opts) {
  return JSON.stringify(opts);
}

const streams: any = {};
export function getWriteStream(opts) {
  const key = getKey(opts);
  let totalStream = streams[key];
  if (totalStream == null) {
    totalStream = new PassThrough();
    streams[key] = totalStream;
  }
  const chunkStream = new PassThrough();
  return { chunkStream, totalStream };
}

function freeWriteStream(opts) {
  delete streams[getKey(opts)];
}
