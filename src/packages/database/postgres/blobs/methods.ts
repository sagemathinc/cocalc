/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * PostgreSQL blob storage methods - save, retrieve, and manage blobs
 * Includes integration with Google Cloud Storage for external blob storage
 *
 * Migrated from CoffeeScript using decaffeinate
 */

// Bucket used for cheaper longterm storage of blobs (outside of PostgreSQL).
// NOTE: We should add this to site configuration, and have it get read once when first
// needed and cached.  Also it would be editable in admin account settings.
// If this env variable begins with a / it is assumed to be a path in the file system,
// e.g., a remote mount (in practice, we are using gcsfuse to mount gcloud buckets).
// If it is gs:// then it is a google cloud storage bucket.
// 2025-01-10: noticed rarely this variable is not set, at least not initially after startup.
// Hardcoding the path, which has never changed anyways.
// Maybe https://github.com/nodejs/help/issues/3618

import * as async from "async";
import * as fs from "fs";
import * as zlib from "zlib";

import * as misc_node from "@cocalc/backend/misc_node";
import { bind_methods, defaults } from "@cocalc/util/misc";
import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/callback";

import { filesystem_bucket } from "../../filesystem-bucket";
import type {
  ArchivePatchesOpts,
  BackupBlobsToTarballOpts,
  BlobCompression,
  BlobCopyErrors,
  BlobMaintenanceOpts,
  CloseBlobOpts,
  CopyAllBlobsToGcloudOpts,
  CopyBlobToGcloudOpts,
  DeleteBlobOpts,
  ExportPatchesOpts,
  GetBlobOpts,
  ImportPatch,
  ImportPatchesOpts,
  LegacySyncstringPatch,
  PostgreSQL as PostgreSQLType,
  RemoveBlobTtlsOpts,
  SaveBlobOpts,
  SyncstringMaintenanceOpts,
  SyncstringPatchInput,
  SyncstringPatch,
  TouchBlobOpts,
} from "../types";

// Import from relative paths (going up two levels from postgres/blobs/)
const { expire_time, one_result, all_results } = require("../../postgres-base");
import * as blobs from "./archive";

const COCALC_BLOB_STORE_FALLBACK = "/blobs";
let COCALC_BLOB_STORE = String(
  process.env.COCALC_BLOB_STORE ?? COCALC_BLOB_STORE_FALLBACK,
);

const required = defaults.required;

// some queries do searches, which could take a bit. we give them 5 minutes …
const TIMEOUT_LONG_S = 300;

type PostgreSQLConstructor = new (...args: any[]) => PostgreSQLType;
type BlobStore = ReturnType<typeof filesystem_bucket>;
type QueryRowsResult<T> = { rows: T[] };
type BlobExpireRow = { expire?: Date | null };
type BlobRow = {
  expire?: Date | null;
  blob?: Buffer | null;
  gcloud?: string | null;
  compress?: BlobCompression | null;
};
type BlobStorageRow = { blob?: Buffer | null; gcloud?: string | null };
type BlobSizeRow = { id: string; size: number };
type SaveBlobOptsNormalized = Omit<SaveBlobOpts, "blob" | "uuid"> & {
  blob: Buffer;
  uuid: string;
};
type ExtendBlobTtlOpts = {
  expire?: Date | null;
  ttl: number;
  uuid: string;
  cb: CB<number | undefined>;
};
type ArchivePatchesOptsWithDb = ArchivePatchesOpts & { db: PostgreSQLType };

export function extend_PostgreSQL<TBase extends PostgreSQLConstructor>(
  ext: TBase,
): TBase {
  return class PostgreSQL extends ext {
    constructor(...args: any[]) {
      super(...args);
      bind_methods(this);
    }

    save_blob(opts: SaveBlobOpts) {
      let optsWithDefaults = defaults(opts, {
        uuid: undefined, // uuid=sha1-based id coming from blob
        blob: required, // unless check=true, we assume misc_node.uuidsha1(opts.blob) == opts.uuid;
        // blob must be a string or Buffer
        ttl: 0, // object in blobstore will have *at least* this ttl in seconds;
        // if there is already something in blobstore with longer ttl, we leave it;
        // infinite ttl = 0.
        project_id: undefined, // the id of the project that is saving the blob
        account_id: undefined, // the id of the user that is saving the blob
        check: false, // if true, will give error if misc_node.uuidsha1(opts.blob) != opts.uuid
        compress: undefined, // optional compression to use: 'gzip', 'zlib'; only used if blob not already in db.
        level: -1, // compression level (if compressed) -- see https://github.com/expressjs/compression#level
        cb: required,
      }) as SaveBlobOpts; // cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
      let blob = Buffer.isBuffer(optsWithDefaults.blob)
        ? optsWithDefaults.blob
        : Buffer.from(optsWithDefaults.blob);
      optsWithDefaults.blob = blob;
      const uuid = optsWithDefaults.uuid ?? misc_node.uuidsha1(blob);
      optsWithDefaults.uuid = uuid;
      const optsNormalized = optsWithDefaults as SaveBlobOptsNormalized;
      if (optsNormalized.check) {
        // CRITICAL: We assume everywhere below that opts.blob is a
        // buffer, e.g., in the .toString('hex') method!
        const computedUuid = misc_node.uuidsha1(blob);
        if (computedUuid !== uuid) {
          optsNormalized.cb(
            `the sha1 uuid (='${computedUuid}') of the blob must equal the given uuid (='${uuid}')`,
          );
          return;
        }
      }
      if (!misc.is_valid_uuid_string(uuid)) {
        optsNormalized.cb("uuid is invalid");
        return;
      }
      const dbg = this._dbg(`save_blob(uuid='${optsNormalized.uuid}')`) as (
        ...args: unknown[]
      ) => void;
      dbg();
      let rows: BlobExpireRow[] | undefined;
      let ttl: number | undefined;
      return async.series(
        [
          (cb) => {
            return this._query({
              query: "SELECT expire FROM blobs",
              where: { "id = $::UUID": optsNormalized.uuid },
              cb: (err, result?: QueryRowsResult<BlobExpireRow>) => {
                rows = result?.rows;
                return cb(err);
              },
            });
          },
          (cb: CB) => {
            if (rows && rows.length === 0 && optsNormalized.compress) {
              dbg(
                "compression requested and blob not already saved, so we compress blob",
              );
              switch (optsNormalized.compress) {
                case "gzip":
                  return zlib.gzip(
                    blob,
                    { level: optsNormalized.level },
                    (err, compressed) => {
                      blob = compressed;
                      optsNormalized.blob = blob;
                      return cb(err);
                    },
                  );
                case "zlib":
                  return zlib.deflate(
                    blob,
                    { level: optsNormalized.level },
                    (err, compressed) => {
                      blob = compressed;
                      optsNormalized.blob = blob;
                      return cb(err);
                    },
                  );
                default:
                  return cb(
                    `compression format '${optsNormalized.compress}' not implemented`,
                  );
              }
            } else {
              return cb();
            }
          },
          (cb) => {
            if (rows && rows.length === 0) {
              dbg("nothing in DB, so we insert the blob.");
              ({ ttl } = optsNormalized);
              return this._query({
                query: "INSERT INTO blobs",
                values: {
                  id: optsNormalized.uuid,
                  blob: "\\x" + blob.toString("hex"),
                  project_id: optsNormalized.project_id,
                  account_id: optsNormalized.account_id,
                  count: 0,
                  size: blob.length,
                  created: new Date(),
                  compress: optsNormalized.compress,
                  expire: ttl ? expire_time(ttl) : undefined,
                },
                cb,
              });
            } else {
              dbg(
                "blob already in the DB, so see if we need to change the expire time",
              );
              return this._extend_blob_ttl({
                expire: rows?.[0]?.expire,
                ttl: optsNormalized.ttl ?? 0,
                uuid: optsNormalized.uuid,
                cb: (err, _ttl) => {
                  ttl = _ttl;
                  return cb(err);
                },
              });
            }
          },
          (cb) => {
            // double check that the blob definitely exists and has correct expire
            // See discussion at https://github.com/sagemathinc/cocalc/issues/7715
            // The problem is that maybe with VERY low probability somehow we extend
            // the blob ttl at the same time that we're deleting blobs and the extend
            // is too late and does an empty update.
            return this._query({
              query: "SELECT expire FROM blobs",
              where: { "id = $::UUID": optsNormalized.uuid },
              cb: (err, result?: QueryRowsResult<BlobExpireRow>) => {
                if (err) {
                  cb(err);
                  return;
                }
                // some consistency checks
                rows = result?.rows;
                if (!rows || rows.length === 0) {
                  cb("blob got removed while saving it");
                  return;
                }
                if (!optsNormalized.ttl && rows[0]?.expire) {
                  cb("blob should have infinite ttl but it has expire set");
                  return;
                }
                return cb();
              },
            });
          },
        ],
        (err) => optsNormalized.cb(err, ttl),
      );
    }

    // Used internally by save_blob to possibly extend the expire time of a blob.
    _extend_blob_ttl(opts: ExtendBlobTtlOpts) {
      const optsWithDefaults = defaults(opts, {
        expire: undefined, // what expire is currently set to in the database
        ttl: required, // requested ttl -- extend expire to at least this
        uuid: required,
        cb: required,
      }) as ExtendBlobTtlOpts; // (err, effective ttl (with 0=oo))
      if (!misc.is_valid_uuid_string(optsWithDefaults.uuid)) {
        optsWithDefaults.cb("uuid is invalid");
        return;
      }
      if (!optsWithDefaults.expire) {
        // ttl already infinite -- nothing to do
        optsWithDefaults.cb(undefined, 0);
        return;
      }
      let new_expire: Date | number | undefined;
      let ttl: number | undefined;
      if (optsWithDefaults.ttl) {
        // saved ttl is finite as is requested one; change in DB if requested is longer
        const z = expire_time(optsWithDefaults.ttl);
        if (z > optsWithDefaults.expire) {
          new_expire = z;
          ({ ttl } = optsWithDefaults);
        } else {
          ttl =
            (optsWithDefaults.expire.getTime() - new Date().getTime()) / 1000.0;
        }
      } else {
        // saved ttl is finite but requested one is infinite
        ttl = new_expire = 0;
      }
      if (new_expire != null) {
        // change the expire time for the blob already in the DB
        return this._query({
          query: "UPDATE blobs",
          where: { "id = $::UUID": optsWithDefaults.uuid },
          set: {
            "expire :: TIMESTAMP ": new_expire === 0 ? undefined : new_expire,
          },
          cb: (err) => optsWithDefaults.cb(err, ttl),
        });
      } else {
        return optsWithDefaults.cb(undefined, ttl);
      }
    }

    get_blob(opts: GetBlobOpts) {
      const optsWithDefaults = defaults(opts, {
        uuid: required,
        save_in_db: false, // if true and blob isn't in DB and is only in gcloud, copies to local DB
        // (for faster access e.g., 20ms versus 5ms -- i.e., not much faster; gcloud is FAST too.)
        touch: true,
        cb: required,
      }) as GetBlobOpts; // cb(err) or cb(undefined, blob_value) or cb(undefined, undefined) in case no such blob
      if (!misc.is_valid_uuid_string(optsWithDefaults.uuid)) {
        optsWithDefaults.cb("uuid is invalid");
        return;
      }
      let x: BlobRow | undefined;
      let blob: Buffer | undefined;
      return async.series(
        [
          (cb) => {
            return this._query({
              query: "SELECT expire, blob, gcloud, compress FROM blobs",
              where: { "id = $::UUID": optsWithDefaults.uuid },
              cb: one_result((err, row?: BlobRow) => {
                x = row;
                return cb(err);
              }),
            });
          },
          (cb) => {
            if (x == null) {
              // nothing to do -- blob not in db (probably expired)
              return cb();
            } else if (x.expire && x.expire <= new Date()) {
              // the blob already expired -- background delete it
              this._query({
                // delete it (but don't wait for this to finish)
                query: "DELETE FROM blobs",
                where: { "id = $::UUID": optsWithDefaults.uuid },
              });
              return cb();
            } else if (x.blob != null) {
              // blob not expired and is in database
              ({ blob } = x);
              return cb();
            } else if (x.gcloud) {
              if (COCALC_BLOB_STORE == null) {
                // see comment https://github.com/sagemathinc/cocalc/pull/8110
                COCALC_BLOB_STORE = COCALC_BLOB_STORE_FALLBACK;
              }
              // blob not available locally, but should be in a Google cloud storage bucket -- try to get it
              // NOTE: we now ignore the actual content of x.gcloud -- we don't support spreading blobs
              // across multiple buckets... as it isn't needed because buckets are infinite, and it
              // is potentially confusing to manage.
              return this.blob_store().read({
                name: optsWithDefaults.uuid,
                cb: (err, storedBlob) => {
                  if (err) {
                    return cb(err);
                  } else {
                    blob = storedBlob;
                    cb();
                    if (optsWithDefaults.save_in_db) {
                      // also save in database so will be faster next time (again, don't wait on this)
                      return this._query({
                        // delete it (but don't wait for this to finish)
                        query: "UPDATE blobs",
                        set: { blob },
                        where: { "id = $::UUID": optsWithDefaults.uuid },
                      });
                    }
                  }
                },
              });
            } else {
              // blob not local and not in gcloud -- this shouldn't happen
              // (just view this as "expired" by not setting blob)
              return cb();
            }
          },
          (cb: CB) => {
            const compression = x?.compress;
            if (blob == null || compression == null) {
              cb();
              return;
            }
            // blob is compressed -- decompress it
            switch (compression) {
              case "gzip":
                return zlib.gunzip(blob, (err, _blob) => {
                  blob = _blob;
                  return cb(err);
                });
              case "zlib":
                return zlib.inflate(blob, (err, _blob) => {
                  blob = _blob;
                  return cb(err);
                });
              default:
                return cb(
                  `compression format '${compression}' not implemented`,
                );
            }
          },
        ],
        (err) => {
          optsWithDefaults.cb(err, blob);
          if (blob != null && optsWithDefaults.touch) {
            // blob was pulled from db or gcloud, so note that it was accessed (updates a counter)
            return this.touch_blob({ uuid: optsWithDefaults.uuid });
          }
        },
      );
    }

    touch_blob(opts: TouchBlobOpts) {
      const optsWithDefaults = defaults(opts, {
        uuid: required,
        cb: undefined,
      }) as TouchBlobOpts;
      if (!misc.is_valid_uuid_string(optsWithDefaults.uuid)) {
        optsWithDefaults.cb?.("uuid is invalid");
        return;
      }
      return this._query({
        query: "UPDATE blobs SET count = count + 1, last_active = NOW()",
        where: { "id = $::UUID": optsWithDefaults.uuid },
        cb: optsWithDefaults.cb,
      });
    }

    blob_store(bucket?: string): BlobStore {
      if (!bucket) {
        bucket = COCALC_BLOB_STORE;
      }
      // File system -- could be a big NFS volume, remotely mounted gcsfuse, or just
      // a single big local file system -- etc. -- we don't care.
      return filesystem_bucket({ name: bucket });
    }

    // Uploads the blob with given sha1 uuid to gcloud storage, if it hasn't already
    // been uploaded there.  Actually we copy to a directory, which uses gcsfuse to
    // implicitly upload to gcloud...
    copy_blob_to_gcloud(opts: CopyBlobToGcloudOpts) {
      const optsWithDefaults = defaults(opts, {
        uuid: required, // uuid=sha1-based uuid coming from blob
        bucket: COCALC_BLOB_STORE, // name of bucket
        force: false, // if true, upload even if already uploaded
        remove: false, // if true, deletes blob from database after successful upload to gcloud (to free space)
        cb: undefined,
      }) as CopyBlobToGcloudOpts; // cb(err)
      const dbg = this._dbg(
        `copy_blob_to_gcloud(uuid='${optsWithDefaults.uuid}')`,
      ) as (...args: unknown[]) => void;
      dbg();
      if (!misc.is_valid_uuid_string(optsWithDefaults.uuid)) {
        dbg("invalid uuid");
        optsWithDefaults.cb?.("uuid is invalid");
        return;
      }
      if (!optsWithDefaults.bucket) {
        optsWithDefaults.bucket = COCALC_BLOB_STORE_FALLBACK;
      }
      const locals: { x?: BlobStorageRow; bucket?: BlobStore } = {};
      return async.series(
        [
          (cb) => {
            dbg("get blob info from database");
            return this._query({
              query: "SELECT blob, gcloud FROM blobs",
              where: { "id = $::UUID": optsWithDefaults.uuid },
              cb: one_result((err, row?: BlobStorageRow) => {
                locals.x = row;
                if (err) {
                  return cb(err);
                } else if (row == null) {
                  return cb("no such blob");
                } else if (!row.blob && !row.gcloud) {
                  return cb(
                    "blob not available -- this should not be possible",
                  );
                } else if (!row.blob && optsWithDefaults.force) {
                  return cb(
                    "blob can't be re-uploaded since it was already deleted",
                  );
                } else {
                  return cb();
                }
              }),
            });
          },
          (cb) => {
            const blobInfo = locals.x;
            if (!blobInfo) {
              return cb("no such blob");
            }
            if (
              (blobInfo.gcloud != null && !optsWithDefaults.force) ||
              blobInfo.blob == null
            ) {
              dbg(
                "already uploaded -- don't need to do anything; or already deleted locally",
              );
              cb();
              return;
            }
            // upload to Google cloud storage
            locals.bucket = this.blob_store(optsWithDefaults.bucket);
            const bucket = locals.bucket;
            if (!bucket) {
              return cb("blob store not available");
            }
            return bucket.write({
              name: optsWithDefaults.uuid,
              content: blobInfo.blob,
              cb,
            });
          },
          (cb) => {
            const blobInfo = locals.x;
            if (!blobInfo) {
              return cb("no such blob");
            }
            if (
              (blobInfo.gcloud != null && !optsWithDefaults.force) ||
              blobInfo.blob == null
            ) {
              // already uploaded -- don't need to do anything; or already deleted locally
              cb();
              return;
            }
            dbg("read blob back and compare"); // -- we do *NOT* trust GCS with such important data
            const bucket = locals.bucket;
            if (!bucket) {
              return cb("blob store not available");
            }
            const blobBuffer = blobInfo.blob;
            if (!blobBuffer) {
              return cb("blob not available");
            }
            return bucket.read({
              name: optsWithDefaults.uuid,
              cb: (err, data) => {
                if (err) {
                  return cb(err);
                } else if (!data) {
                  return cb("blob read returned no data");
                } else if (!blobBuffer.equals(data)) {
                  dbg("FAILED!");
                  return cb("BLOB write to GCS failed check!");
                } else {
                  dbg("check succeeded");
                  return cb();
                }
              },
            });
          },
          (cb) => {
            const blobInfo = locals.x;
            if (!blobInfo) {
              return cb("no such blob");
            }
            if (blobInfo.blob == null) {
              // no blob in db; nothing further to do.
              return cb();
            } else {
              // We successful upload to gcloud -- set locals.x.gcloud
              const set: { gcloud: string; blob?: null } = {
                gcloud: optsWithDefaults.bucket ?? COCALC_BLOB_STORE_FALLBACK,
              };
              if (optsWithDefaults.remove) {
                set.blob = null; // remove blob content from database to save space
              }
              return this._query({
                query: "UPDATE blobs",
                where: { "id = $::UUID": optsWithDefaults.uuid },
                set,
                cb,
              });
            }
          },
        ],
        (err) => optsWithDefaults.cb?.(err),
      );
    }

    /*
    Backup limit blobs that previously haven't been dumped to blobs, and put them in
    a tarball in the given path.  The tarball's name is the time when the backup starts.
    The tarball is compressed using gzip compression.

       db._error_thresh=1e6; db.backup_blobs_to_tarball(limit:10000,path:'/backup/tmp-blobs',repeat_until_done:60, cb:done())

    I have not written code to restore from these tarballs.  Assuming the database has been restored,
    so there is an entry in the blobs table for each blob, it would suffice to upload the tarballs,
    then copy their contents straight into the COCALC_BLOB_STORE, and that’s it.
    If we don't have the blobs table in the DB, make dummy entries from the blob names in the tarballs.
    */
    backup_blobs_to_tarball(opts: BackupBlobsToTarballOpts) {
      const optsWithDefaults = defaults(opts, {
        limit: 10000, // number of blobs to backup
        path: required, // path where [timestamp].tar file is placed
        throttle: 0, // wait this many seconds between pulling blobs from database
        repeat_until_done: 0, // if positive, keeps re-call'ing this function until no more
        // results to backup (pauses this many seconds between)
        map_limit: 5,
        cb: undefined,
      }) as BackupBlobsToTarballOpts; // cb(err, '[timestamp].tar')
      const dbg = this._dbg(
        `backup_blobs_to_tarball(limit=${optsWithDefaults.limit},path='${optsWithDefaults.path}')`,
      ) as (...args: unknown[]) => void;
      const { join } = require("path");
      const dir = misc.date_to_snapshot_format(new Date());
      const target = join(optsWithDefaults.path, dir);
      const tarball = target + ".tar.gz";
      let v: string[] | undefined;
      const to_remove: string[] = [];
      return async.series(
        [
          (cb) => {
            dbg(`make target='${target}'`);
            return fs.mkdir(target, cb);
          },
          (cb) => {
            dbg("get blobs that we need to back up");
            return this._query({
              query: "SELECT id FROM blobs",
              where: "expire IS NULL and backup IS NOT true",
              limit: optsWithDefaults.limit,
              timeout_s: TIMEOUT_LONG_S,
              cb: all_results("id", (err, ids: string[]) => {
                v = ids;
                return cb(err);
              }),
            });
          },
          (cb) => {
            if (!v) {
              cb("no blobs found");
              return;
            }
            dbg(`backing up ${v.length} blobs`);
            const f = (id: string, cb: CB) => {
              return this.get_blob({
                uuid: id,
                touch: false,
                cb: (err, blob) => {
                  if (err) {
                    dbg(`ERROR! blob ${id} -- ${err}`);
                    return cb(err);
                  } else if (blob != null) {
                    dbg(`got blob ${id} from db -- now write to disk`);
                    to_remove.push(id);
                    return fs.writeFile(join(target, id), blob, () => {
                      if (optsWithDefaults.throttle) {
                        return setTimeout(cb, optsWithDefaults.throttle * 1000);
                      } else {
                        return cb();
                      }
                    });
                  } else {
                    dbg(`blob ${id} is expired, so nothing to be done, ever.`);
                    return cb();
                  }
                },
              });
            };
            return async.mapLimit(v, optsWithDefaults.map_limit, f, cb);
          },
          (cb) => {
            dbg("successfully wrote all blobs to files; now make tarball");
            return misc_node.execute_code({
              command: "tar",
              args: ["zcvf", tarball, dir],
              path: optsWithDefaults.path,
              timeout: 3600,
              cb,
            });
          },
          (cb) => {
            dbg("remove temporary blobs");
            const f = (id: string, cb: CB) => {
              return fs.unlink(join(target, id), cb);
            };
            return async.mapLimit(to_remove, 10, f, cb);
          },
          (cb) => {
            dbg("remove temporary directory");
            return fs.rmdir(target, cb);
          },
          (cb) => {
            dbg("backup succeeded completely -- mark all blobs as backed up");
            return this._query({
              query: "UPDATE blobs",
              set: { backup: true },
              where: { "id = ANY($)": v },
              cb,
            });
          },
        ],
        (err) => {
          if (err) {
            dbg(`ERROR: ${err}`);
            return optsWithDefaults.cb?.(err);
          } else {
            dbg("done");
            if (
              optsWithDefaults.repeat_until_done &&
              to_remove.length === optsWithDefaults.limit
            ) {
              const f = () => {
                return this.backup_blobs_to_tarball(optsWithDefaults);
              };
              return setTimeout(f, optsWithDefaults.repeat_until_done * 1000);
            } else {
              return optsWithDefaults.cb?.(undefined, tarball);
            }
          }
        },
      );
    }

    /*
    Copied all blobs that will never expire to a google cloud storage bucket.

        errors={}; db.copy_all_blobs_to_gcloud(limit:500, cb:done(), remove:true, repeat_until_done_s:10, errors:errors)
    */
    copy_all_blobs_to_gcloud(opts: CopyAllBlobsToGcloudOpts) {
      const optsWithDefaults = defaults(opts, {
        bucket: COCALC_BLOB_STORE,
        limit: 1000, // copy this many in each batch
        map_limit: 1, // copy this many at once.
        throttle: 0, // wait this many seconds between uploads
        repeat_until_done_s: 0, // if nonzero, waits this many seconds, then calls this function again until nothing gets uploaded.
        errors: undefined, // object: used to accumulate errors -- if not given, then everything will terminate on first error
        remove: false,
        cutoff: "1 month", // postgresql interval - only copy blobs to gcloud that haven't been accessed at least this long.
        cb: required,
      }) as CopyAllBlobsToGcloudOpts;
      const dbg = this._dbg("copy_all_blobs_to_gcloud") as (
        ...args: unknown[]
      ) => void;
      dbg();
      // This query selects the blobs that will never expire, but have not yet
      // been copied to Google cloud storage.
      dbg("getting blob id's...");
      return this._query({
        query: "SELECT id, size FROM blobs",
        where: `expire IS NULL AND gcloud IS NULL and (last_active <= NOW() - INTERVAL '${optsWithDefaults.cutoff}' OR last_active IS NULL)`,
        limit: optsWithDefaults.limit,
        timeout_s: TIMEOUT_LONG_S,
        //#  order_by : 'id'  # this is not important and was causing VERY excessive load in production (due to bad query plannnig?!)
        cb: all_results((err, rows: BlobSizeRow[]) => {
          if (err) {
            dbg(`fail: ${err}`);
            return optsWithDefaults.cb(err);
          } else {
            const n = rows.length;
            let m = 0;
            dbg(`got ${n} blob id's`);
            const f = (x: BlobSizeRow, cb: CB) => {
              m += 1;
              const k = m;
              const start = new Date();
              dbg(
                `**** ${k}/${n}: uploading ${x.id} of size ${x.size / 1000}KB`,
              );
              return this.copy_blob_to_gcloud({
                uuid: x.id,
                bucket: optsWithDefaults.bucket,
                remove: optsWithDefaults.remove,
                cb: (err) => {
                  dbg(
                    `**** ${k}/${n}: finished -- ${err}; size ${
                      x.size / 1000
                    }KB; time=${new Date().getTime() - start.getTime()}ms`,
                  );
                  if (err) {
                    if (optsWithDefaults.errors != null) {
                      optsWithDefaults.errors[x.id] = err;
                    } else {
                      cb(err);
                    }
                  }
                  if (optsWithDefaults.throttle) {
                    return setTimeout(cb, 1000 * optsWithDefaults.throttle);
                  } else {
                    return cb();
                  }
                },
              });
            };
            return async.mapLimit(
              rows,
              optsWithDefaults.map_limit,
              f,
              (err) => {
                dbg(`finished this round -- ${err}`);
                if (err && optsWithDefaults.errors == null) {
                  optsWithDefaults.cb(err);
                  return;
                }
                if (optsWithDefaults.repeat_until_done_s && rows.length > 0) {
                  dbg("repeat_until_done triggering another round");
                  return setTimeout(
                    () => this.copy_all_blobs_to_gcloud(optsWithDefaults),
                    optsWithDefaults.repeat_until_done_s * 1000,
                  );
                } else {
                  dbg(`done : ${misc.to_json(optsWithDefaults.errors)}`);
                  return optsWithDefaults.cb(
                    misc.len(optsWithDefaults.errors) > 0
                      ? optsWithDefaults.errors
                      : undefined,
                  );
                }
              },
            );
          }
        }),
      });
    }

    blob_maintenance(opts: BlobMaintenanceOpts) {
      const optsWithDefaults = defaults(opts, {
        path: "/backup/blobs",
        map_limit: 1,
        blobs_per_tarball: 10000,
        throttle: 0,
        cb: undefined,
      }) as BlobMaintenanceOpts;
      const dbg = this._dbg("blob_maintenance()") as (
        ...args: unknown[]
      ) => void;
      dbg();
      const path = optsWithDefaults.path ?? "/backup/blobs";
      return async.series(
        [
          (cb) => {
            dbg("maintain the patches and syncstrings");
            return this.syncstring_maintenance({
              repeat_until_done: true,
              limit: 500,
              map_limit: optsWithDefaults.map_limit,
              delay: 1000, // 1s, since syncstring_maintence heavily loads db
              cb,
            });
          },
          (cb) => {
            dbg("backup_blobs_to_tarball");
            return this.backup_blobs_to_tarball({
              throttle: optsWithDefaults.throttle,
              limit: optsWithDefaults.blobs_per_tarball,
              path,
              map_limit: optsWithDefaults.map_limit,
              repeat_until_done: 5,
              cb,
            });
          },
          (cb) => {
            dbg("copy_all_blobs_to_gcloud");
            const errors: BlobCopyErrors = {};
            return this.copy_all_blobs_to_gcloud({
              limit: 1000,
              repeat_until_done_s: 5,
              errors,
              remove: true,
              map_limit: optsWithDefaults.map_limit,
              throttle: optsWithDefaults.throttle,
              cb: (err) => {
                if (misc.len(errors) > 0) {
                  dbg(`errors! ${misc.to_json(errors)}`);
                }
                return cb(err);
              },
            });
          },
        ],
        (err) => {
          return optsWithDefaults.cb?.(err);
        },
      );
    }

    remove_blob_ttls(opts: RemoveBlobTtlsOpts) {
      const optsWithDefaults = defaults(opts, {
        uuids: required, // uuid=sha1-based from blob
        cb: required,
      }) as RemoveBlobTtlsOpts; // cb(err)
      return this._query({
        query: "UPDATE blobs",
        set: { expire: null },
        where: {
          "id::UUID = ANY($)": (() => {
            const result: string[] = [];
            for (const x of optsWithDefaults.uuids) {
              if (misc.is_valid_uuid_string(x)) {
                result.push(x);
              }
            }
            return result;
          })(),
        },
        cb: optsWithDefaults.cb,
      });
    }

    // If blob has been copied to gcloud, remove the BLOB part of the data
    // from the database (to save space).  If not copied, copy it to gcloud,
    // then remove from database.
    close_blob(opts: CloseBlobOpts) {
      const optsWithDefaults = defaults(opts, {
        uuid: required, // uuid=sha1-based from blob
        bucket: COCALC_BLOB_STORE,
        cb: undefined,
      }) as CloseBlobOpts; // cb(err)
      if (!misc.is_valid_uuid_string(optsWithDefaults.uuid)) {
        optsWithDefaults.cb?.("uuid is invalid");
        return;
      }
      return async.series(
        [
          (cb) => {
            // ensure blob is in gcloud
            return this._query({
              query: "SELECT gcloud FROM blobs",
              where: { "id = $::UUID": optsWithDefaults.uuid },
              cb: one_result("gcloud", (err, gcloud) => {
                if (err) {
                  return cb(err);
                } else if (!gcloud) {
                  // not yet copied to gcloud storage
                  return this.copy_blob_to_gcloud({
                    uuid: optsWithDefaults.uuid,
                    bucket: optsWithDefaults.bucket,
                    cb,
                  });
                } else {
                  // copied already
                  return cb();
                }
              }),
            });
          },
          (cb) => {
            // now blob is in gcloud -- delete blob data in database
            return this._query({
              query: "SELECT gcloud FROM blobs",
              where: { "id = $::UUID": optsWithDefaults.uuid },
              set: { blob: null },
              cb,
            });
          },
        ],
        (err) => optsWithDefaults.cb?.(err),
      );
    }

    /*
     * Syncstring maintenance
     */
    syncstring_maintenance(opts: SyncstringMaintenanceOpts) {
      const optsWithDefaults = defaults(opts, {
        age_days: 30, // archive patches of syncstrings that are inactive for at least this long
        map_limit: 1, // how much parallelism to use
        limit: 1000, // do only this many
        repeat_until_done: true,
        delay: 0,
        cb: undefined,
      }) as SyncstringMaintenanceOpts;
      const dbg = this._dbg("syncstring_maintenance") as (
        ...args: unknown[]
      ) => void;
      dbg(optsWithDefaults);
      const ageDays = optsWithDefaults.age_days ?? 30;
      const mapLimit = optsWithDefaults.map_limit ?? 1;
      const limit = optsWithDefaults.limit ?? 1000;
      let syncstrings: string[] | undefined;
      return async.series(
        [
          (cb) => {
            dbg("determine inactive syncstring ids");
            return this._query({
              query: "SELECT string_id FROM syncstrings",
              where: [
                {
                  "last_active <= $::TIMESTAMP": misc.days_ago(ageDays),
                },
                "archived IS NULL",
                "huge IS NOT TRUE",
              ],
              limit,
              timeout_s: TIMEOUT_LONG_S,
              cb: all_results("string_id", (err, ids: string[]) => {
                syncstrings = ids;
                return cb(err);
              }),
            });
          },
          (cb) => {
            if (!syncstrings) {
              cb("no syncstrings found");
              return;
            }
            dbg("archive patches for inactive syncstrings");
            const total = syncstrings.length;
            let i = 0;
            const f = (string_id: string, cb: CB) => {
              i += 1;
              console.log(
                `*** ${i}/${total}: archiving string ${string_id} ***`,
              );
              return this.archivePatches({
                string_id,
                cb: (err) => {
                  if (err || !optsWithDefaults.delay) {
                    return cb(err);
                  } else {
                    return setTimeout(cb, optsWithDefaults.delay);
                  }
                },
              });
            };
            return async.mapLimit(syncstrings, mapLimit, f, cb);
          },
        ],
        (err) => {
          if (err) {
            return optsWithDefaults.cb?.(err);
          } else if (
            optsWithDefaults.repeat_until_done &&
            syncstrings &&
            syncstrings.length === limit
          ) {
            dbg("doing it again");
            return this.syncstring_maintenance(optsWithDefaults);
          } else {
            return optsWithDefaults.cb?.();
          }
        },
      );
    }

    async archivePatches(opts: ArchivePatchesOpts) {
      try {
        const opts_with_db: ArchivePatchesOptsWithDb = { ...opts, db: this };
        await blobs.archivePatches(opts_with_db);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    /*
    Export/import of syncstring history and info.
    */
    async export_patches(opts: ExportPatchesOpts) {
      try {
        const patches = (await blobs.exportPatches(
          opts.string_id,
        )) as SyncstringPatch[];
        opts.cb?.(undefined, patches);
        return patches;
      } catch (err) {
        if (opts.cb) {
          return opts.cb(err);
        }
        throw err;
      }
    }

    import_patches(opts: ImportPatchesOpts) {
      const optsWithDefaults = defaults(opts, {
        patches: required, // array as exported by export_patches
        string_id: undefined, // if given, change the string_id when importing the patches to this
        cb: undefined,
      }) as ImportPatchesOpts;
      let { patches } = optsWithDefaults;
      if (patches.length === 0) {
        // easy
        optsWithDefaults.cb?.();
        return;
      }
      if (isLegacyPatch(patches[0])) {
        // convert from OLD RethinkDB format!
        const converted: SyncstringPatchInput[] = [];
        for (const legacyPatch of patches as LegacySyncstringPatch[]) {
          const patch: SyncstringPatchInput = {
            string_id: legacyPatch.id[0],
            time: new Date(legacyPatch.id[1]),
            user_id: legacyPatch.user,
            patch: legacyPatch.patch,
            snapshot: legacyPatch.snapshot,
            sent: legacyPatch.sent,
            prev: legacyPatch.prev,
          };
          converted.push(patch);
        }
        patches = converted;
      }
      const normalizedPatches = patches as SyncstringPatchInput[];
      // change string_id, if requested.
      if (optsWithDefaults.string_id != null) {
        for (const patch of normalizedPatches) {
          patch.string_id = optsWithDefaults.string_id;
        }
      }
      // We break into blocks since there is limit (about 65K) on
      // number of params that can be inserted in a single query.
      const insert_block_size = 1000;
      const f = (i: number, cb: CB) => {
        return this._query({
          query: "INSERT INTO patches",
          values: normalizedPatches.slice(
            insert_block_size * i,
            insert_block_size * (i + 1),
          ),
          conflict: "ON CONFLICT DO NOTHING", // in case multiple servers (or this server) are doing this import at once -- this can and does happen sometimes.
          cb,
        });
      };
      return async.mapSeries(
        __range__(0, normalizedPatches.length / insert_block_size, false),
        f,
        (err) => optsWithDefaults.cb?.(err),
      );
    }

    delete_blob(opts: DeleteBlobOpts) {
      const optsWithDefaults = defaults(opts, {
        uuid: required,
        cb: undefined,
      }) as DeleteBlobOpts;
      if (!misc.is_valid_uuid_string(optsWithDefaults.uuid)) {
        optsWithDefaults.cb?.("uuid is invalid");
        return;
      }
      let gcloud: string | undefined;
      const dbg = this._dbg(`delete_blob(uuid='${optsWithDefaults.uuid}')`) as (
        ...args: unknown[]
      ) => void;
      return async.series(
        [
          (cb) => {
            dbg("check if blob in gcloud");
            return this._query({
              query: "SELECT gcloud FROM blobs",
              where: { "id = $::UUID": optsWithDefaults.uuid },
              cb: one_result("gcloud", (err, x) => {
                gcloud = x;
                return cb(err);
              }),
            });
          },
          (cb) => {
            if (!gcloud || !COCALC_BLOB_STORE) {
              cb();
              return;
            }
            dbg("delete from gcloud");
            return this.blob_store(gcloud).delete({
              name: optsWithDefaults.uuid,
              cb,
            });
          },
          (cb) => {
            dbg("delete from local database");
            return this._query({
              query: "DELETE FROM blobs",
              where: { "id = $::UUID": optsWithDefaults.uuid },
              cb,
            });
          },
        ],
        (err) => optsWithDefaults.cb?.(err),
      );
    }
  };
}

function isLegacyPatch(patch: ImportPatch): patch is LegacySyncstringPatch {
  return (
    typeof patch === "object" &&
    patch != null &&
    Array.isArray((patch as LegacySyncstringPatch).id)
  );
}

function __range__(left: number, right: number, inclusive: boolean): number[] {
  const range: number[] = [];
  const ascending = left < right;
  const end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
