/*
Support user uploading files directly to CoCalc from their browsers.

- uploading to projects and compute servers, with full support for potentially
  very LARGE file uploads that stream via NATS.  This checks users is authenticated
  with write access.

- uploading blobs to our database.

Which of the above happens depends on query params.

NOTE:  Code for downloading files from projects/compute servers
is in the middle of packages/hub/proxy/handle-request.ts
*/

import { Router } from "express";
import { getLogger } from "@cocalc/hub/logger";
import getAccount from "@cocalc/server/auth/get-account";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import formidable from "formidable";
import { PassThrough } from "node:stream";
import { writeFile as writeFileToProject } from "@cocalc/nats/files/write";
import { join } from "path";
import { delay } from "awaiting";

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
        await handleBlobUpload({ ttl, req, res });
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

async function handleBlobUpload({ ttl, req, res }) {
  throw Error("blob handling not implemented");
}

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
  let errors: string[] = [];

  const state = { done: false };
  let filename = "noname.txt";
  let stream: any | null = null;
  let chunkStream: any | null = null;
  const form = formidable({
    keepExtensions: true,
    hashAlgorithm: "sha1",
    // file = {"size":195,"newFilename":"649205cf239d49f350c645f00.py","originalFilename":"a (2).py","mimetype":"application/octet-stream","hash":"318c0246ae31424f9225b566e7e09bef6c8acc40"}
    fileWriteStreamHandler: (file) => {
      console.log("fileWriteStreamHandler");
      filename = file?.["originalFilename"] ?? "noname.txt";
      const { chunkStream: chunkStream0, totalStream } = getWriteStream({
        project_id,
        compute_server_id,
        path,
        filename,
      });
      console.log("fileWriteStreamHandler: got back chunkstream");
      chunkStream = chunkStream0;
      stream = totalStream;
      (async () => {
        for await (const data of chunkStream) {
          stream.write(data);
        }
        state.done = true;
      })();
      return chunkStream;
    },
  });

  console.log('starting parsing form"');
  const [fields] = await form.parse(req);
  // console.log("form", { fields, files });
  // fields looks like this: {"dzuuid":["ce5fa828-5155-4fa0-b30a-869bd4c956a5"],"dzchunkindex":["1"],"dztotalfilesize":["10000000"],"dzchunksize":["8000000"],"dztotalchunkcount":["2"],"dzchunkbyteoffset":["8000000"]}

  const index = parseInt(fields.dzchunkindex?.[0] ?? "0");
  const count = parseInt(fields.dztotalchunkcount?.[0] ?? "1");
  if (index == 0) {
    // start
    // @ts-ignore
    (async () => {
      try {
        console.log("NATS: started writing ", filename);
        await writeFileToProject({
          stream,
          project_id,
          compute_server_id,
          path: `${join(path, filename)}.partial-${Math.random()}`,
        });
        console.log("NATS: finished writing ", filename);
      } catch (err) {
        console.log("NATS: error ", err);
        errors.push(`${err}`);
      } finally {
        console.log("NATS: freeing write stream");
        freeWriteStream({
          project_id,
          compute_server_id,
          path,
          filename,
        });
      }
    })();
  }
  if (index == count - 1) {
    console.log("finish");
    while (!state.done) {
      await delay(100);
    }
    stream.end();
  }
  if (errors.length > 0) {
    res.status(500).send(`upload failed -- ${errors.join(", ")}`);
  } else {
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
