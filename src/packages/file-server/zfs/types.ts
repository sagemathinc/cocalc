export interface Project {
  namespace: string;
  project_id: string;
  pool: string;
  // true if project is currently archived
  archived: boolean;
  // array of hosts (or range using CIDR notation) that we're
  // granting NFS client access to.
  nfs: string[];
  // list of snapshots as ISO timestamps from oldest to newest
  snapshots: string[];
  // name of the most recent snapshot that was used for sending a stream
  // (for incremental backups). this won't be deleted by the snapshot
  // trimming process.
  last_send_snapshot?: string;
  // Last_edited = last time this project was "edited" -- various
  // operations cause this to get updated.
  last_edited?: Date;
  // optional arbitrary affinity string - we attempt if possible to put
  // projects with the same affinity in the same pool, to improve chances of dedup.
  affinity?: string;
  // if this is set, then some sort of error that "should" never happen,
  // has happened, and manual intervention is needed.
  error?: string;
}

// Used for set(...), main thing being each field can be ProjectFieldFunction,
// which makes it very easy to *safely* mutate data (assuming only one process
// is using sqlite).
type ProjectFieldFunction = (project: Project) => any;
export interface SetProject {
  project_id: string;
  namespace?: string;
  pool?: string | ProjectFieldFunction;
  archived?: boolean | ProjectFieldFunction;
  nfs?: string[] | ProjectFieldFunction;
  snapshots?: string[] | ProjectFieldFunction;
  last_send_snapshot?: string | ProjectFieldFunction;
  last_edited?: Date | ProjectFieldFunction;
  affinity?:  null | string | ProjectFieldFunction;
  error?: null | string | ProjectFieldFunction;
}

// what is *actually* stored in sqlite
export interface RawProject {
  namespace: string;
  project_id: string;
  pool: string;
  // 0 or 1
  archived?: number;
  // nfs and snasphots are v.join(',')
  nfs?: string;
  snapshots?: string;
  last_send_snapshot?: string;
  // new Date().ISOString()
  last_edited?: string;
  affinity?: string;
  error?: string;
}
