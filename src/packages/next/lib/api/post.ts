import basePath from "lib/base-path";
import { join } from "path";

const VERSION = "v2";

export default async function apiPost(
  path: string,
  data: object
): Promise<{ [key: string]: any }> {
  const response = await fetch(join(basePath, VERSION, "api", path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  try {
    return await response.json();
  } catch (err) {
    console.log(response);
    throw err;
  }
}
