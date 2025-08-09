import { fsServer, DEFAULT_FILE_SERVICE } from "@cocalc/conat/files/fs";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { mkdir } from "fs/promises";
import { join } from "path";
import { isValidUUID } from "@cocalc/util/misc";
import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/backend/conat/conat";

export async function localPathFileserver({
  path,
  service = DEFAULT_FILE_SERVICE,
  client,
  project_id,
  unsafeMode,
}: {
  path: string;
  service?: string;
  client?: Client;
  // if project_id is specified, use single project mode.
  project_id?: string;
  unsafeMode?: boolean;
}) {
  client ??= conat();

  const singleProjectFilesystem = project_id
    ? new SandboxedFilesystem(path, { unsafeMode })
    : undefined;

  const server = await fsServer({
    service,
    client,
    project_id,
    fs: async (subject: string) => {
      if (project_id) {
        return singleProjectFilesystem!;
      } else {
        const project_id = getProjectId(subject);
        const p = join(path, project_id);
        try {
          await mkdir(p);
        } catch {}
        return new SandboxedFilesystem(p, { unsafeMode, project_id });
      }
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
