import * as fs from "fs";
const winston = require("./winston-metrics").get_logger("utils");
import { PostgreSQL } from "./postgres/types";
import { AllSiteSettings } from "../smc-util/db-schema/types";

export function get_smc_root(): string {
  return process.env.SMC_ROOT ?? ".";
}

export function read_db_password_from_disk(): string | null {
  const filename = get_smc_root() + "/data/secrets/postgres";
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

// just to make this async friendly, that's all
export async function get_server_settings(
  db: PostgreSQL
): Promise<AllSiteSettings> {
  return new Promise((done, fail) => {
    db.get_server_settings_cached({
      cb: (err, settings) => {
        if (err) {
          fail(err);
        } else {
          done(settings);
        }
      }
    });
  });
}
