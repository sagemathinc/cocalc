
export interface Project {
  namespace: string;
  project_id: string;
  pool: string;
  // if set, its location where project is archived
  archived?: string;
  // optional arbitrary affinity string - we attempt if possible to put
  // projects with the same affinity in the same pool, to improve chances of dedup.
  affinity?: string;
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
  // operations cause this to get updated. An ISO timestamp.
  last_edited?: string;
}
