import { aux_file } from "@cocalc/util/misc";

export function termPath({
  path,
  number,
  cmd,
}: {
  path: string;
  number: number;
  cmd?: string;
}) {
  return aux_file(`${path}-${number}${cmd ?? ""}`, "term");
}
