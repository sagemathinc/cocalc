import api from "lib/api/post";
import { join } from "path";

export default async function copyPublicPath({
  id,
  path,
  relativePath,
  src_project_id,
  target_project_id,
}): Promise<void> {
  await api("/projects/copy-path", {
    src_project_id,
    target_project_id,
    path: join(path, relativePath),
    public_id: id,
    timeout: 15, // if big we do NOT want to allow copying something ridiculuos
  });
}
