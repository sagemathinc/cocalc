import { fsServer } from "@cocalc/conat/files/fs";
import { conat } from "@cocalc/backend/conat";
import { SandboxedFilesystem } from "@cocalc/file-server/fs/sandbox";
import { mkdir } from "fs/promises";
import { join } from "path";
import { isValidUUID } from "@cocalc/util/misc";

export function localPathFileserver({
  service,
  path,
}: {
  service: string;
  path: string;
}) {
  const client = conat();
  const server = fsServer({
    service,
    client,
    fs: async (subject: string) => {
      const project_id = getProjectId(subject);
      const p = join(path, project_id);
      try {
        await mkdir(p);
      } catch {}
      return new SandboxedFilesystem(p);
    },
  });
  return server;
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
