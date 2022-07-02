import api from "lib/api/post";
import { join } from "path";

export default async function copyPublicPath({
  id,
  path,
  url,
  relativePath,
  src_project_id,
  target_project_id,
}): Promise<void> {
  if (url) {
    await api("/projects/copy-url", {
      project_id: target_project_id,
      url,
      timeout: 30, // if big we do NOT want to allow copying something ridiculuos
    });
  }

  await api("/projects/copy-path", {
    src_project_id,
    url,
    target_project_id,
    path: join(path, relativePath),
    public_id: id,
    timeout: 30, // if big we do NOT want to allow copying something ridiculuos
  });
}
