/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Jupyter's in-memory blob store (based on sqlite), which hooks into the raw http server.
*/

const { do_not_laod_transpilers } = require("../init-program");

if (do_not_laod_transpilers) {
  console.warn(
    "[project/jupyter-blobs] coffeescript transpiler is not enabled!"
  );
} else {
  // because of misc and misc_node below.  Delete this when those are typescript'd
  require("coffee-register");
}

import { BlobStoreInterface } from "../smc-webapp/jupyter/project-interface";

const fs = require("fs");

import { readFile } from "./async-utils-node";

const winston = require("winston");

import { months_ago, to_json } from "../smc-util/misc";

const misc_node = require("smc-util-node/misc_node");

import * as Database from "better-sqlite3";

let JUPYTER_BLOBS_DB_FILE: string;
if (process.env.JUPYTER_BLOBS_DB_FILE) {
  JUPYTER_BLOBS_DB_FILE = process.env.JUPYTER_BLOBS_DB_FILE;
} else {
  JUPYTER_BLOBS_DB_FILE = `${
    process.env.SMC_LOCAL_HUB_HOME != null
      ? process.env.SMC_LOCAL_HUB_HOME
      : process.env.HOME
  }/.jupyter-blobs-v0.db`;
}

// TODO: are these the only base64 encoded types that jupyter kernels return?
const BASE64_TYPES = ["image/png", "image/jpeg", "application/pdf", "base64"];

export class BlobStore implements BlobStoreInterface {
  private db: Database.Database;

  constructor() {
    winston.debug("jupyter BlobStore: constructor");
    try {
      this._init();
      winston.debug(`jupyter BlobStore: ${JUPYTER_BLOBS_DB_FILE} opened fine`);
    } catch (err) {
      winston.debug(
        `jupyter BlobStore: ${JUPYTER_BLOBS_DB_FILE} open error - ${err}`
      );
      // File may be corrupt/broken/etc. -- in this case, remove and try again.
      // This database is only an image *cache*, so this is fine.
      // See https://github.com/sagemathinc/cocalc/issues/2766
      // Using sync is also fine, since this only happens once
      // during initialization.
      winston.debug("jupyter BlobStore: resetting database cache");
      try {
        fs.unlinkSync(JUPYTER_BLOBS_DB_FILE);
      } catch (error) {
        err = error;
        winston.debug(
          `Error trying to delete ${JUPYTER_BLOBS_DB_FILE}... ignoring: `,
          err
        );
      }
      this._init();
    }
  }

  _init(): void {
    if (JUPYTER_BLOBS_DB_FILE == "memory") {
      this.db = new Database(".db", { memory: true });
    } else {
      this.db = new Database(JUPYTER_BLOBS_DB_FILE);
    }
    this.db
      .prepare(
        "CREATE TABLE IF NOT EXISTS blobs (sha1 TEXT, data BLOB, type TEXT, ipynb TEXT, time INTEGER)"
      )
      .run();
    this._clean(); // do this once on start
  }

  _clean(): void {
    // Delete anything old...
    // The main point of this blob store being in the db is to ensure that when the
    // project restarts, then user saves an ipynb,
    // that they do not loose any work.  So a few weeks should be way more than enough.
    // Note that TimeTravel may rely on these old blobs, so images in TimeTravel may
    // stop working after this long.  That's a tradeoff.
    this.db
      .prepare("DELETE FROM blobs WHERE time <= ?")
      .run(months_ago(1).getTime());
  }

  // used in testing
  delete_all_blobs(): void {
    this.db.prepare("DELETE FROM blobs").run();
  }

  // data could, e.g., be a uuencoded image
  // We return the sha1 hash of it, and store it, along with a reference count.
  // ipynb = (optional) text that is also stored and will be
  //         returned when get_ipynb is called
  //         This is used for some iframe support code.
  save(data, type, ipynb?): string {
    if (BASE64_TYPES.includes(type)) {
      data = Buffer.from(data, "base64");
    } else {
      data = Buffer.from(data);
    }
    const sha1: string = misc_node.sha1(data);
    const row = this.db.prepare("SELECT * FROM blobs where sha1=?").get(sha1);
    if (row == null) {
      this.db
        .prepare("INSERT INTO blobs VALUES(?, ?, ?, ?, ?)")
        .run([sha1, data, type, ipynb, new Date().valueOf()]);
    } else {
      this.db
        .prepare("UPDATE blobs SET time=? WHERE sha1=?")
        .run([new Date().valueOf(), sha1]);
    }
    return sha1;
  }

  // Read a file from disk and save it in the database.
  // Returns the sha1 hash of the file.
  async readFile(path: string, type: string): Promise<string> {
    return await this.save(await readFile(path), type);
  }

  /*
  free(sha1: string): void {
    // instead, stuff gets freed 1 month after last save.
  }
  */

  // Return data with given sha1, or undefined if no such data.
  get(sha1: string): undefined | Buffer {
    const x = this.db.prepare("SELECT data FROM blobs where sha1=?").get(sha1);
    if (x != null) {
      return x.data;
    }
  }

  get_ipynb(sha1: string): any {
    const row = this.db
      .prepare("SELECT ipynb, type, data FROM blobs where sha1=?")
      .get(sha1);
    if (row == null) {
      return;
    }
    if (row.ipynb != null) {
      return row.ipynb;
    }
    if (BASE64_TYPES.includes(row.type)) {
      return row.data.toString("base64");
    } else {
      return row.data.toString();
    }
  }

  keys(): string[] {
    return this.db
      .prepare("SELECT sha1 FROM blobs")
      .all()
      .map((x) => x.sha1);
  }

  express_router(base, express) {
    const router = express.Router();
    base += "blobs/";

    router.get(base, (_, res) => {
      res.send(to_json(this.keys()));
    });

    router.get(base + "*", (req, res) => {
      const filename: string = req.path.slice(base.length);
      const sha1: string = req.query.sha1;
      res.type(filename);
      res.send(this.get(sha1));
    });
    return router;
  }
}

export const blob_store = new BlobStore();
