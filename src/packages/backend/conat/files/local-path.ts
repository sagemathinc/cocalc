import { fsServer, DEFAULT_FILE_SERVICE } from "@cocalc/conat/files/fs";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { isValidUUID } from "@cocalc/util/misc";
import { mkdir } from "fs/promises";
import { join } from "path";
import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/backend/conat/conat";
import { client as createFileClient } from "@cocalc/conat/files/file-server";

export async function localPathFileserver({
  path,
  service = DEFAULT_FILE_SERVICE,
  client,
  project_id,
  unsafeMode,
}: {
  service?: string;
  client?: Client;
  // if project_id is specified, only serve this one project_id
  project_id?: string;

  // - if path is given, serve projects from `${path}/${project_id}`, except in 1-project mode (when project_id is given above),
  //   in which case we just server the project from path directly.
  // - if path not given, connect to the file-server service on the conat network.
  path?: string;
  unsafeMode?: boolean;
} = {}) {
  client ??= conat();

  const getPath = async (project_id2: string) => {
    if (project_id != null && project_id != project_id2) {
      throw Error(`only serves ${project_id}`);
    }
    if (path != null) {
      if (project_id != null) {
        // in 1-project mode just server directly from path
        return path;
      }
      const p = join(path, project_id2);
      try {
        await mkdir(p);
      } catch {}
      return p;
    } else {
      const fsclient = createFileClient({ client });
      return (await fsclient.mount({ project_id: project_id2 })).path;
    }
  };

  const server = await fsServer({
    service,
    client,
    project_id,
    fs: async (subject: string) => {
      const project_id = getProjectId(subject);
      return new SandboxedFilesystem(await getPath(project_id), {
        unsafeMode,
        host: project_id,
      });
    },
  });
  return { server, client, path, service, close: () => server.close() };
}

function getProjectId(subject: string) {
  const v = subject.split(".");
  if (v.length != 2) {
    throw Error("subject must have 2 segments");
  }
  if (!v[1].startsWith("project-")) {
    throw Error("second segment of subject must start with 'project-'");
  }
  const project_id = v[1].slice("project-".length);
  if (!isValidUUID(project_id)) {
    throw Error("not a valid project id");
  }
  return project_id;
}
