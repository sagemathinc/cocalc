import { fsServer, DEFAULT_FILE_SERVICE } from "@cocalc/conat/files/fs";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { isValidUUID } from "@cocalc/util/misc";
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
  // if project_id is specified, use single project mode.
  project_id?: string;
  // only used in single project mode
  path?: string;
  unsafeMode?: boolean;
} = {}) {
  client ??= conat();

  const server = await fsServer({
    service,
    client,
    project_id,
    fs: async (subject: string) => {
      if (project_id) {
        if (path == null) {
          throw Error("path must be specified");
        }
        return new SandboxedFilesystem(path, { unsafeMode });
      } else {
        const project_id = getProjectId(subject);
        const fsclient = createFileClient({ client });
        const { path } = await fsclient.mount({ project_id });
        return new SandboxedFilesystem(path, { unsafeMode, project_id });
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
