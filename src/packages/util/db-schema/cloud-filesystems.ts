/*
Configuration of network mounted shared POSIX filesystems associated
to projects for use initially by the compute servers.

Initially these will get mounted by all compute servers uniformly (mostly),
and later the project will also mount these via a sidecar.

This is 100% built on juicefs/keydb instead of gcs/s3, etc., since:

- there are so many gotchas with directly using fuse mounted gcs/s3,
- people can just use those directly or mount them directly easily
  anyways (since they are root)
*/

import { Table } from "./types";
import { ID, NOTES } from "./crm";
import { SCHEMA as schema } from "./index";
import type { MoneyValue } from "@cocalc/util/money";

// We do NOT charge to make a cloud file system.  However, we require that
// the user have enough money to make a CREATE_CLOUD_FILESYSTEM_AMOUNT purchase.
// One reason to require credit is because billing is delayed by several days,
// and a user could spend substantially during that time (e.g., over $1000
// seems possible, e.g., bandwidth egress to China is $0.23/GB, and you can
// probably download 100MB/s or over 300GB/hour, or over $3000 in 2 days).
export const CREATE_CLOUD_FILESYSTEM_AMOUNT = 1;

export const DEFAULT_LOCK = "DELETE";
// Since all storage gets mounted on all compute servers, and basically
// you only need one shared storage volume in most cases, we do put a global
// limit to avoid abuse and efficiency issues for now.
export const MAX_CLOUD_FILESYSTEMS_PER_PROJECT = 100;
// We use a random port on the VPN between MIN_PORT and MAX_PORT.
export const MIN_PORT = 40000;
export const MAX_PORT = 48000;
export const MIN_BLOCK_SIZE = 1;
// requires my fork of juicefs to get above 16 (supports 64)!
// do not use non-fork on a file system with a block size bigger
// than 16, as it may corrupt it...
// Just in case -- for now we will restrict to 16 anyways.
export const MAX_BLOCK_SIZE = 16;
export const RECOMMENDED_BLOCK_SIZE = 16;

export interface GoogleCloudServiceAccountKey {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: "googleapis.com";
}

export type Compression = "lz4" | "zstd" | "none";
export const GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES = [
  "standard",
  "nearline",
  "coldline",
  "archive",
  "autoclass-nearline",
  "autoclass-archive",
];
export const GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC = {
  "autoclass-nearline": {
    desc: "Autoclass - transitions objects between Standard or Nearline based on activity",
  },
  "autoclass-archive": {
    desc: "Autoclass - transitions objects between Standard, Nearline, Coldline, and Archive based on activity",
  },
  standard: {
    desc: "Standard - short-term storage and frequently accessed data",
    minStorageDays: 0,
  },
  nearline: {
    desc: "Nearline - backups and data accessed less than once a month",
    minStorageDays: 30,
  },
  coldline: {
    desc: "Coldline - disaster recovery and data accessed less than once a quarter",
    minStorageDays: 90,
  },
  archive: {
    desc: "Archive - long-term digital preservation of data accessed less than once a year",
    minStorageDays: 365,
  },
};
export type GoogleCloudBucketStorageClass =
  (typeof GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES)[number];

// We implement the three multiregions: asia, eu, and us.
// We also support *all* single regions.  Dual regions are
// complicated to specify and have subtle restrictions and
// probably aren't that critical for our users, so we don't
// support them.
export const GOOGLE_CLOUD_MULTIREGIONS = ["us", "eu", "asia"];
// We will have to update the zone list when google adds more zones, since I didn't
// want to have a dependency on my package @cocalc/gcloud-pricing-calculator.
// However it's easy using that package:
//    a =require('@cocalc/gcloud-pricing-calculator')
//    z = new Set(Object.keys((await a.getData()).zones).map((x)=>{i=x.lastIndexOf('-');return x.slice(0,i)}))
export const GOOGLE_CLOUD_REGIONS = [
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
  "us-south1",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "europe-north1",
  "europe-central2",
  "europe-southwest1",
  "europe-west1",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "europe-west10",
  "europe-west12",
  "southamerica-east1",
  "southamerica-west1",
  "africa-south1",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-south2",
  "asia-southeast1",
  "asia-southeast2",
  "australia-southeast1",
  "australia-southeast2",
  "me-central1",
  "me-central2",
  "me-west1",
];

export const GOOGLE_REGION_PREFIX_TO_LOCATION = {
  us: "North America",
  northamerica: "North America",
  europe: "Europe",
  southamerica: "South America",
  africa: "South Africa",
  asia: "APAC",
  australia: "APAC",
  me: "Middle East",
  eu: "Europe",
};

export type GoogleCloudBucketLocation =
  | (typeof GOOGLE_CLOUD_MULTIREGIONS)[number]
  | (typeof GOOGLE_CLOUD_REGIONS)[number];

export interface CloudFilesystem {
  id: number;
  project_specific_id: number;
  project_id: string;
  account_id: string;
  created: Date;
  bucket?: string;
  mountpoint: string;
  mount?: boolean; // whether it should get mounted right now
  secret_key?: GoogleCloudServiceAccountKey;
  port: number;
  compression: Compression;
  block_size: number;
  trash_days: number;
  bucket_location: GoogleCloudBucketLocation;
  bucket_storage_class: GoogleCloudBucketStorageClass;
  mount_options?: string;
  keydb_options?: string;
  title?: string;
  color?: string;
  deleting?: boolean;
  error?: string;
  notes?: string;
  lock?: string;
  position?: number;
  last_edited?: Date;
  purchase_id?: number;
  bytes_used?: number;
}
// See https://juicefs.com/docs/community/command_reference#mount

//

export type CreateCloudFilesystem = Pick<
  CloudFilesystem,
  | "project_id"
  | "mountpoint"
  | "mount"
  | "compression"
  | "block_size"
  | "trash_days"
  | "title"
  | "color"
  | "notes"
  | "position"
  | "mount_options"
  | "keydb_options"
  | "bucket_location"
  | "bucket_storage_class"
>;

export const DEFAULT_CONFIGURATION = {
  mountpoint: "cloud",
  mount: true,
  compression: "lz4",
  block_size: RECOMMENDED_BLOCK_SIZE,
  trash_days: 0,
  title: "Untitled",
  lock: "DELETE",
  //
  // Without writeback things are quite slow (with GCS), so it's enabled.
  // "-o allow_other" is because:
  //  - makes 'juicefs rmr /home/user/cloudfs/.trash' to empty the trash *possible*;
  //    as non-root there is no way to empty trash!
  //  - makes it possible to use ZFS on top of this, which may be interesting later.
  //  - --open-cache=(something) is needed since otherwise juicefs tries to use redis for network
  //    locks, which just don't work with async replication.
  mount_options:
    "--writeback -o allow_other --open-cache=1 --backup-meta=7200 --backup-skip-trash",
  keydb_options: "",
  bucket_location: "us-east1", // where cocalc.com is
  bucket_storage_class: "autoclass-archive",
} as const;

export interface EditCloudFilesystem
  extends Pick<
    CloudFilesystem,
    | "id"
    | "mount"
    | "title"
    | "color"
    | "notes"
    | "position"
    | "mount_options"
    | "keydb_options"
    | "lock"
  > {
  // making these optional
  project_id?: string;
  mountpoint?: string;
  trash_days?: number;
  bucket_storage_class?: GoogleCloudBucketStorageClass;
}

export const CHANGE_MOUNTED = new Set([
  "title",
  "color",
  "notes",
  "lock",
  "mount",
  "position",
  "bucket_storage_class",
  "trash_days",
]);
export const CHANGE_UNMOUNTED = new Set([
  "project_id",
  "mountpoint",
  "mount_options",
  "keydb_options",
  "port",
]);

Table({
  name: "cloud_filesystems",
  rules: {
    primary_key: "id",
    // unique mountpoint *within* a given project; also unique port in case the
    // storage service requires a port to sync (e.g., keydb).
    pg_unique_indexes: [
      "(project_id, mountpoint)",
      "(project_id, port)",
      "(project_id, project_specific_id)",
      "bucket",
    ],
    user_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        throttle_changes: 0,
        fields: {
          id: null,
          project_specific_id: null,
          project_id: null,
          account_id: null,
          bucket: null,
          mountpoint: null,
          mount: null,
          port: null,
          compression: null,
          block_size: null,
          trash_days: null,
          bucket_location: null,
          bucket_storage_class: null,
          title: null,
          color: null,
          error: null,
          notes: null,
          lock: null,
          position: null,
          last_edited: null,
          purchase_id: null,
          deleting: null,
          mount_options: null,
          keydb_options: null,
          bytes_used: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          id: true,
          mount: true,
          error: true,
          notes: true,
          title: true,
          color: true,
          position: true,
          lock: true,
        },
      },
    },
  },
  fields: {
    id: ID,
    project_specific_id: {
      not_null: true,
      type: "integer",
      desc: "A unique project-specific id assigned to this cloud file system.  This is a positive integer that is guaranteed to be unique for cloud filesystems *in a given project* and minimal when assigned (so it is as small as possible).  For now at least, I'm not using this in any way except as something to display to users.  Internally we always use the global id.",
    },
    project_id: {
      not_null: true,
      type: "uuid",
      desc: "The project id that this compute server provides compute for.",
      render: { type: "project_link" },
    },
    account_id: {
      not_null: true,
      type: "uuid",
      desc: "User that owns this cloud file system (they pay)",
      render: { type: "account" },
    },
    created: {
      not_null: true,
      type: "timestamp",
      desc: "When the compute server was created.",
    },
    bucket: {
      type: "string",
      pg_type: "VARCHAR(63)",
      desc: "Google cloud storage bucket backing this filesystem",
      render: { type: "text", maxLength: 63, editable: false },
    },
    bucket_storage_class: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Default storage class of the google cloud storage bucket",
      render: { type: "text", maxLength: 64, editable: false },
    },
    bucket_location: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Where the google cloud storage bucket is stored.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    mountpoint: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(4096)",
      desc: "Where compute server is mounted in the file system.  If a relative path, then relative to home directory.  Target path does not have to be empty.  For sanity we restrict this string more than an arbitrary linux path.",
      render: { type: "text", maxLength: 4096, editable: true },
    },
    mount: {
      type: "boolean",
      desc: "If true, then this cloud file system will be mounted on all compute servers associated to the project.",
    },
    secret_key: {
      type: "map",
      pg_type: "jsonb",
      desc: "Secret key needed to use the bucket. It's a structured jsonb object.  For google cloud storage, it's exactly the service account.  This will only be not set if something went wrong initializing this storage.",
    },
    port: {
      type: "integer",
      desc: "Numerical port where local service runs on each client for the file system.  E.g., this is keydb for juicefs.",
    },
    compression: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Compression for the file system: lz4, zstd or none.  Cannot be changed.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    block_size: {
      type: "integer",
      not_null: true,
      desc: "Block size of file system in MB: between 1 and 64, inclusive.  Cannot be changed.",
    },
    trash_days: {
      type: "integer",
      not_null: true,
      desc: "Number of days to store deleted files.  Use 0 to disable.",
    },
    mount_options: {
      type: "string",
      pg_type: "VARCHAR(4096)",
      desc: "Options passed to the command line when running juicefs mount.  See https://juicefs.com/docs/community/command_reference#mount    This exact string is literally put on the command line after 'juicefs mount', and obviously getting it mangled can break mounting the file system.",
      render: { type: "text", maxLength: 4096, editable: true },
    },
    keydb_options: {
      type: "string",
      pg_type: "VARCHAR(16384)",
      desc: "Keydb (/Redis) configuration. This is placed at the end of keydb.conf and can be used to override or add to the keydb configuration used on each client.",
      render: { type: "text", maxLength: 16384, editable: true },
    },
    title: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Title of this computer server.  Used purely to make it easier for the user to keep track of it.",
      render: { type: "text", maxLength: 254, editable: true },
    },
    color: {
      type: "string",
      desc: "A user configurable color, which is used for tags and UI to indicate where a tab is running.",
      pg_type: "VARCHAR(30)",
      render: { type: "color", editable: true },
    },
    deleting: {
      type: "boolean",
      desc: "True if this filesystem is in the process of being deleted.",
    },
    error: {
      type: "string",
      desc: "In case something went wrong, e.g., in starting this compute server, this field will get set with a string error message to show the user. It's also cleared right when we try to start server.",
    },
    notes: NOTES,
    lock: {
      type: "string",
      pg_type: "VARCHAR(128)",
      desc: "String that you must provide as part of any API call to delete this object.  Use this as a personal reminder of conditions under which it is OK to delete this.",
      render: { type: "text", maxLength: 128, editable: true },
    },
    position: {
      type: "number",
      desc: "Used for sorting a list of cloud file systems in the UI.",
    },
    last_edited: {
      type: "timestamp",
      desc: "Last time some field was changed.  Also, this gets updated when the volume is actively mounted by some compute server, since the files are likely edited.",
    },
    purchase_id: {
      type: "number",
      desc: "if there is a current active purchase related to this compute server, this is the id of that purchase in the purchases table",
    },
    bytes_used: {
      not_null: true,
      type: "integer",
      pg_type: "bigint",
      desc: "The total number of bytes of data stored in the file system -- it's the output of df.  It is not impacted by compression, i.e., it's not the bucket size itself.",
    },
  },
});

Table({
  name: "crm_cloud_filesystems",
  fields: schema.cloud_filesystems.fields,
  rules: {
    primary_key: schema.cloud_filesystems.primary_key,
    virtual: "cloud_filesystems",
    user_query: {
      get: {
        admin: true,
        pg_where: [],
        fields: {
          ...schema.cloud_filesystems.user_query?.get?.fields,
          template: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          title: true,
          color: true,
          notes: true,
          mount_options: true,
          keydb_options: true,
        },
      },
    },
  },
});

// some sanity checks
export function assertValidCompression(compression: Compression) {
  if (
    typeof compression == "string" &&
    ["lz4", "zstd", "none"].includes(compression)
  ) {
    return;
  }
  throw Error(`compression must be 'lz4', 'zstd', or 'none'`);
}

export function assertValidPath(path: string) {
  if (typeof path != "string") {
    throw Error("path must be a string");
  }
  if (
    path.includes("\0") ||
    path.includes("\n") ||
    path.includes("~") ||
    path.includes("\\")
  ) {
    throw Error(
      `invalid path '${path}'  -- must not include newlines or null characters or ~ or \\`,
    );
  }
  if (path.length > 4096) {
    throw Error(`invalid path '${path}'  -- must be at most 4096 characters`);
  }
  for (let i = 0; i < path.length; i++) {
    const charCode = path.charCodeAt(i);
    if ((charCode >= 0x00 && charCode <= 0x1f) || charCode === 0x7f) {
      throw Error(`invalid path '${path}'  -- must not include control codes`);
    }
  }
}

Table({
  name: "crm_cloud_filesystems",
  fields: schema.cloud_filesystems.fields,
  rules: {
    primary_key: schema.cloud_filesystems.primary_key,
    virtual: "cloud_filesystems",
    user_query: {
      get: {
        admin: true,
        pg_where: [],
        fields: {
          ...schema.cloud_filesystems.user_query?.get?.fields,
          template: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          title: true,
          color: true,
          notes: true,
          mount_options: true,
          keydb_options: true,
        },
      },
    },
  },
});

export interface CloudFilesystemMetric {
  timestamp: number; // what we get back from api since it's json -- ms since epoch
  compute_server_id: number;
  bytes_used: number;
  process_uptime: number;
  bytes_put?: number | null;
  bytes_get?: number | null;
  objects_put?: number | null;
  objects_get?: number | null;
  objects_delete?: number | null;
  bucket_location: string;
  bucket_storage_class: GoogleCloudBucketStorageClass;
  compute_server_location: GoogleCloudBucketLocation;
  cost?: MoneyValue | null;
}

Table({
  name: "cloud_filesystem_metrics",
  rules: {
    primary_key: ["timestamp", "cloud_filesystem_id", "compute_server_id"],
  },
  fields: {
    timestamp: {
      type: "timestamp",
      desc: "When the metric was submitted.  This is assigned by the database when data is inserted, so should be assumed correct and non-decreasing.",
    },
    cloud_filesystem_id: {
      type: "integer",
      desc: "The id of the cloud file system that this is a metric for.",
    },
    compute_server_id: {
      type: "integer",
      desc: "The id of the compute server that is submitting this metric.",
    },
    bytes_used: {
      not_null: true,
      type: "integer",
      pg_type: "bigint",
      desc: "The total number of bytes of data stored in the file system -- it's the output of df.  It is not impacted by compression, i.e., it's not the bucket size itself.",
    },
    process_uptime: {
      not_null: true,
      type: "number",
      desc: "Seconds since the process started collecting these metrics.",
    },
    bytes_put: {
      type: "integer",
      pg_type: "bigint",
      desc: "The number of bytes of data that was written to cloud storage: juicefs_object_request_data_bytes_PUT in .stats",
    },
    bytes_get: {
      type: "integer",
      pg_type: "bigint",
      desc: "The number of bytes of data that were written to cloud storage: juicefs_object_request_data_bytes_GET in .stats",
    },
    objects_put: {
      type: "integer",
      pg_type: "bigint",
      desc: "Class A Operation: The number of distinct objects that were written to cloud storage: juicefs_object_request_durations_histogram_seconds_PUT_total in .stats",
    },
    objects_get: {
      type: "integer",
      pg_type: "bigint",
      desc: "Class B Operation: The number of distinct objects that were read from cloud storage: juicefs_object_request_durations_histogram_seconds_GET_total in .stats",
    },
    objects_delete: {
      type: "integer",
      pg_type: "bigint",
      desc: "Free Operation: The number of distinct objects that were deleted from cloud storage: juicefs_object_request_durations_histogram_seconds_DELETE_total in .stats",
    },
    bucket_location: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Where the google cloud storage bucket is stored.  A GCP region or 'us','eu','asia' for multiregion buckets.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    bucket_storage_class: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Default storage class of the google cloud storage bucket at this point in time: 'standard', 'nearline', 'coldline', 'archive', 'autoclass-nearline' or 'autoclass-archive'",
      render: { type: "text", maxLength: 64, editable: false },
    },
    compute_server_location: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "A GCP region or 'world', 'china', 'australia', 'unknown'.  Here 'world' means something oether than 'china' or 'australia'.  Also HK doesn't count as 'china'.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    cost: {
      type: "number",
      pg_type: "numeric(20,10)",
      desc: "The estimated accumulated total cost from when the bucket was created until this point in time.  This could be recomputed, but is nice to have easily available, and means we can delete old data.",
    },
    //     cost_state: {
    //       type: "object",
    //       desc: "Extra data at this point in time that can be used somehow in our cost estimation heuristic. E.g., {'bytes_used_standard':20000} would mean that we should assume going forward that 20000 bytes of data is of the standard storage class, irregardless of the current storage class because of a change of class.   Obviously, some of this data could be deleted, but we don't know.",
    //     },
  },
});
