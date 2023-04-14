import { sha1 } from "@cocalc/util/misc";

export default function computeHash({
  history,
  input,
  kernel,
  project_id,
  path,
}: {
  history?: string[];
  input: string;
  kernel: string;
  project_id?: string;
  path?: string;
}): string {
  return sha1(
    JSON.stringify([
      (history ?? []).map((x) => x.trim()),
      input.trim(),
      kernel.toLowerCase().trim(),
      project_id,
      path,
    ])
  );
}
