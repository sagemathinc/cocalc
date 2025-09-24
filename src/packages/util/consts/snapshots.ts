// subdirectory of HOME where snapshots are stored:

export const SNAPSHOTS = ".snapshots";

// Lengths of time in minutes to keep snapshots
// (code below assumes these are listed in ORDER from shortest to longest)
export const SNAPSHOT_INTERVALS_MS = {
  frequent: 15 * 1000 * 60,
  daily: 60 * 24 * 1000 * 60,
  weekly: 60 * 24 * 7 * 1000 * 60,
  monthly: 60 * 24 * 7 * 4 * 1000 * 60,
};

// How many of each type of snapshot to retain
export const DEFAULT_SNAPSHOT_COUNTS = {
  frequent: 4,
  daily: 7,
  weekly: 4,
  monthly: 2,
} as SnapshotCounts;

export const DEFAULT_BACKUP_COUNTS = {
  frequent: 0,
  daily: 1,
  weekly: 3,
  monthly: 4,
} as SnapshotCounts;

// We have at least one snapshot for each interval, assuming
// there are actual changes since the last snapshot, and at
// most the listed number.
export interface SnapshotCounts {
  frequent: number;
  daily: number;
  weekly: number;
  monthly: number;
}

export interface SnapshotSchedule extends SnapshotCounts {
  disabled?: boolean;
}
