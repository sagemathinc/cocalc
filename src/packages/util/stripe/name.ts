import { trunc_middle } from "@cocalc/util/misc";

export default function stripeName(
  firstName: string,
  lastName: string
): string {
  return trunc_middle(`${firstName ?? ""} ${lastName ?? ""}`, 200);
}
