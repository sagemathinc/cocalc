import { join } from "path";
import { secrets } from "../data";
import { readFileSync } from "fs";

export default function dbPassword(): string | undefined {
  const filename = join(secrets, "postgres");
  try {
    // fine to use sync, since reading db password happens only on startup
    return readFileSync(filename).toString().trim();
  } catch {
    return undefined;
  }
}
