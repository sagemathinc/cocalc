/*
Jupyter in-memory blob store, which hooks into the raw http server.
*/

require('coffee-register')  // because of misc and misc_node below.  Delete this when those are typescript'd

const fs = require("fs");

const winston = require("winston");

const misc = require("smc-util/misc");
const misc_node = require("smc-util-node/misc_node");
const Database = require("better-sqlite3");

const DB_FILE = `${
  process.env.SMC_LOCAL_HUB_HOME != null
    ? process.env.SMC_LOCAL_HUB_HOME
    : process.env.HOME
}/.jupyter-blobs-v0.db`;

// TODO: are these the only base64 encoded types that jupyter kernels return?
const BASE64_TYPES = ["image/png", "image/jpeg", "application/pdf", "base64"];

class BlobStore {
  private _db: any;

  constructor() {
    winston.debug("jupyter BlobStore: constructor");
    try {
      this._init();
      winston.debug(`jupyter BlobStore: ${DB_FILE} opened fine`);
    } catch (err) {
      winston.debug(`jupyter BlobStore: ${DB_FILE} open error - ${err}`);
      // File may be corrupt/broken/etc. -- in this case, remove and try again.
      // This database is only an image *cache*, so this is fine.
      // See https://github.com/sagemathinc/cocalc/issues/2766
      // Using sync is also fine, since this only happens once
      // during initialization.
      winston.debug("jupyter BlobStore: resetting database cache");
      try {
        fs.unlinkSync(DB_FILE);
      } catch (error) {
        err = error;
        winston.debug(`Error trying to delete ${DB_FILE}... ignoring: `, err);
      }
      this._init();
    }
  }

  _init(): void {
    this._db = new Database(DB_FILE);
    this._db
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
    return this._db
      .prepare("DELETE FROM blobs WHERE time <= ?")
      .run(misc.months_ago(1) - 0);
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
    const sha1 = misc_node.sha1(data);
    const row = this._db.prepare("SELECT * FROM blobs where sha1=?").get(sha1);
    if (row == null) {
      this._db
        .prepare("INSERT INTO blobs VALUES(?, ?, ?, ?, ?)")
        .run([sha1, data, type, ipynb, new Date().valueOf()]);
    } else {
      this._db
        .prepare("UPDATE blobs SET time=? WHERE sha1=?")
        .run([new Date().valueOf(), sha1]);
    }
    return sha1;
  }

  readFile(path, type, cb): void {
    fs.readFile(path, (err, data) => {
      if (err) {
        cb(err);
      } else {
        cb(undefined, this.save(data, type));
      }
    });
  }

  free(sha1) {}
  // no op -- stuff gets freed 2 weeks after last save.

  get(sha1) {
    const x = this._db.prepare("SELECT data FROM blobs where sha1=?").get(sha1);
    if (x != null) {
      return x.data;
    }
    return undefined;
  }

  get_ipynb(sha1: string) {
    const row = this._db
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
    return this._db
      .prepare("SELECT sha1 FROM blobs")
      .all()
      .map(x => x.sha1);
  }

  express_router(base, express) {
    const router = express.Router();
    base += "blobs/";

    router.get(base, (req, res) => {
      const sha1s = misc.to_json(this.keys());
      return res.send(sha1s);
    });

    router.get(base + "*", (req, res) => {
      const filename = req.path.slice(base.length);
      const { sha1 } = req.query;
      res.type(filename);
      return res.send(this.get(sha1));
    });
    return router;
  }
}

export const blob_store = new BlobStore();
