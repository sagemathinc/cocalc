import basePath from "lib/base-path";
import { join } from "path";

export default async function apiPost(
  path: string,
  data: object
): Promise<{ [key: string]: any }> {
  const response = await fetch(join(basePath, "api", path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return await response.json();
}
