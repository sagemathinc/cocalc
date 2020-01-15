import * as fs from "fs";
const winston = require("./winston-metrics").get_logger("utils");

export function read_db_password_from_disk(): string | null {
  const filename =
    (process.env.SMC_ROOT ? process.env.SMC_ROOT : ".") +
    "/data/secrets/postgres";
  try {
    return fs
      .readFileSync(filename)
      .toString()
      .trim();
  } catch {
    winston.debug("NO PASSWORD FILE!");
    return null;
  }
}
