/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * PostgreSQL blob storage extension module
 * Wrapper methods that delegate to implementation functions.
 */

import type {
  ArchivePatchesOpts,
  BackupBlobsToTarballOpts,
  BlobMaintenanceOpts,
  CloseBlobOpts,
  CopyAllBlobsToGcloudOpts,
  CopyBlobToGcloudOpts,
  DeleteBlobOpts,
  ExportPatchesOpts,
  GetBlobOpts,
  ImportPatchesOpts,
  RemoveBlobTtlsOpts,
  SaveBlobOpts,
  SyncstringMaintenanceOpts,
  SyncstringPatch,
  TouchBlobOpts,
} from "../types";
import type { PostgreSQL } from "../../postgres";

import {
  _extend_blob_ttl,
  archivePatches,
  backup_blobs_to_tarball,
  blob_maintenance,
  blob_store,
  close_blob,
  copy_all_blobs_to_gcloud,
  copy_blob_to_gcloud,
  delete_blob,
  export_patches,
  get_blob,
  import_patches,
  remove_blob_ttls,
  save_blob,
  syncstring_maintenance,
  touch_blob,
  type ExtendBlobTtlOpts,
} from "./methods-impl";

type PostgreSQLConstructor = new (...args: any[]) => PostgreSQL;

export function extend_PostgreSQL<TBase extends PostgreSQLConstructor>(
  ext: TBase,
): TBase {
  return class PostgreSQL extends ext {
    save_blob(opts: SaveBlobOpts) {
      return save_blob(this, opts);
    }

    _extend_blob_ttl(opts: ExtendBlobTtlOpts) {
      return _extend_blob_ttl(this, opts);
    }

    get_blob(opts: GetBlobOpts) {
      return get_blob(this, opts);
    }

    touch_blob(opts: TouchBlobOpts) {
      return touch_blob(this, opts);
    }

    blob_store(bucket?: string) {
      return blob_store(this, bucket);
    }

    copy_blob_to_gcloud(opts: CopyBlobToGcloudOpts) {
      return copy_blob_to_gcloud(this, opts);
    }

    backup_blobs_to_tarball(opts: BackupBlobsToTarballOpts) {
      return backup_blobs_to_tarball(this, opts);
    }

    copy_all_blobs_to_gcloud(opts: CopyAllBlobsToGcloudOpts) {
      return copy_all_blobs_to_gcloud(this, opts);
    }

    async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
      return blob_maintenance(this, opts);
    }

    remove_blob_ttls(opts: RemoveBlobTtlsOpts) {
      return remove_blob_ttls(this, opts);
    }

    close_blob(opts: CloseBlobOpts) {
      return close_blob(this, opts);
    }

    syncstring_maintenance(opts: SyncstringMaintenanceOpts) {
      return syncstring_maintenance(this, opts);
    }

    async archivePatches(opts: ArchivePatchesOpts) {
      return archivePatches(this, opts);
    }

    async export_patches(opts: ExportPatchesOpts): Promise<SyncstringPatch[]> {
      return export_patches(this, opts);
    }

    async import_patches(opts: ImportPatchesOpts): Promise<void> {
      return import_patches(this, opts);
    }

    delete_blob(opts: DeleteBlobOpts) {
      return delete_blob(this, opts);
    }
  };
}
