/*
Send/Receive incremental replication streams of a filesystem.
*/

import { type PrimaryKey } from "./types";
import { get, getRecent, set } from "./db";
import getLogger from "@cocalc/backend/logger";
import {
  filesystemStreamsPath,
  filesystemStreamsFilename,
  filesystemDataset,
} from "./names";
import { exec } from "./util";
import { split } from "@cocalc/util/misc";
import { join } from "path";
import { getSnapshots } from "./snapshots";
import { STREAM_INTERVAL_MS, MAX_STREAMS } from "./config";

const logger = getLogger("file-server:zfs:send");

export async function send(fs: PrimaryKey) {
  const filesystem = get(fs);
  if (filesystem.archived) {
    logger.debug("filesystem is archived, so nothing to do", fs);
    return;
  }
  const { snapshots } = filesystem;
  const newest_snapshot = snapshots[snapshots.length - 1];
  if (!newest_snapshot) {
    logger.debug("no snapshots yet");
    return;
  }
  if (newest_snapshot == filesystem.last_send_snapshot) {
    logger.debug("no new snapshots", fs);
    // the most recent snapshot is the same as the last one we used to make
    // an archive, so nothing to do.
    return;
  }
  await exec({
    command: "sudo",
    args: ["mkdir", "-p", filesystemStreamsPath(filesystem)],
    what: { ...filesystem, desc: "make send target directory" },
  });

  let stream;
  if (!filesystem.last_send_snapshot) {
    logger.debug("doing first ever send -- a full send");
    stream = filesystemStreamsFilename({
      ...filesystem,
      snapshot1: new Date(0).toISOString(),
      snapshot2: newest_snapshot,
    });
    try {
      await exec({
        verbose: true,
        command: `sudo sh -c 'zfs send -e -c -R ${filesystemDataset(filesystem)}@${newest_snapshot} > ${stream}.temp'`,
        what: {
          ...filesystem,
          desc: "send: zfs send of full filesystem dataset (first full send)",
        },
      });
    } catch (err) {
      await exec({
        verbose: true,
        command: "sudo",
        args: ["rm", `${stream}.temp`],
      });
      throw err;
    }
  } else {
    logger.debug("doing incremental send");
    const snapshot1 = filesystem.last_send_snapshot;
    const snapshot2 = newest_snapshot;
    stream = filesystemStreamsFilename({
      ...filesystem,
      snapshot1,
      snapshot2,
    });
    try {
      await exec({
        verbose: true,
        command: `sudo sh -c 'zfs send -e -c -I @${snapshot1} ${filesystemDataset(filesystem)}@${snapshot2} > ${stream}.temp'`,
        what: {
          ...filesystem,
          desc: "send: zfs incremental send",
        },
      });
    } catch (err) {
      await exec({
        verbose: true,
        command: "sudo",
        args: ["rm", `${stream}.temp`],
      });
      throw err;
    }
  }
  await exec({
    verbose: true,
    command: "sudo",
    args: ["mv", `${stream}.temp`, stream],
  });
  set({ ...fs, last_send_snapshot: newest_snapshot });
}

async function getStreams(fs: PrimaryKey) {
  const filesystem = get(fs);
  const streamsPath = filesystemStreamsPath(filesystem);
  const { stdout } = await exec({
    command: "sudo",
    args: ["ls", streamsPath],
    what: { ...filesystem, desc: "getting list of streams" },
  });
  return split(stdout.trim()).filter((path) => path.endsWith(".zfs"));
}

export async function recv(fs: PrimaryKey) {
  const filesystem = get(fs);
  if (filesystem.archived) {
    throw Error("filesystem must not be archived");
  }
  const streams = await getStreams(filesystem);
  if (streams.length == 0) {
    logger.debug("no streams");
    return;
  }
  const { snapshots } = filesystem;
  const newest_snapshot = snapshots[snapshots.length - 1] ?? "";
  const toRead = streams.filter((snapshot) => snapshot >= newest_snapshot);
  if (toRead.length == 0) {
    return;
  }
  const streamsPath = filesystemStreamsPath(filesystem);
  try {
    for (const stream of toRead) {
      await exec({
        verbose: true,
        command: `sudo sh -c 'cat ${join(streamsPath, stream)} | zfs recv ${filesystemDataset(filesystem)}'`,
        what: {
          ...filesystem,
          desc: `send: zfs incremental receive`,
        },
      });
    }
  } finally {
    // ensure snapshots and size info in our database is up to date:
    await getSnapshots(fs);
  }
}

function getRange(streamName) {
  const v = streamName.split("Z-");
  return { snapshot1: v + "Z", snapshot2: v[1].slice(0, -".zfs".length) };
}

// Replace older streams so that there are at most maxStreams total streams.
export async function recompact({
  maxStreams,
  ...fs
}: PrimaryKey & { maxStreams: number }) {
  const filesystem = get(fs);
  const { snapshots } = filesystem;
  const streams = await getStreams(filesystem);
  if (streams.length <= maxStreams) {
    // nothing to do
    return;
  }
  if (maxStreams < 1) {
    throw Error("maxStreams must be at least 1");
  }
  // replace first n streams by one full replication stream
  let n = streams.length - maxStreams + 1;
  let snapshot2 = getRange(streams[n - 1]).snapshot2;
  while (!snapshots.includes(snapshot2) && n < streams.length) {
    snapshot2 = getRange(streams[n]).snapshot2;
    if (snapshots.includes(snapshot2)) {
      break;
    }
    n += 1;
  }
  if (!snapshots.includes(snapshot2)) {
    throw Error(
      "bug -- this can't happen because we never delete the last snapshot used for send",
    );
  }

  const stream = filesystemStreamsFilename({
    ...filesystem,
    snapshot1: new Date(0).toISOString(),
    snapshot2,
  });
  try {
    await exec({
      verbose: true,
      command: `sudo sh -c 'zfs send -e -c -R ${filesystemDataset(filesystem)}@${snapshot2} > ${stream}.temp'`,
      what: {
        ...filesystem,
        desc: "send: zfs send of full filesystem dataset (first full send)",
      },
    });
    // if this rm were to fail, then things would be left in a broken state,
    // since ${stream}.temp also gets deleted in the catch.  But it seems
    // highly unlikely this rm of the old streams would ever fail.
    const path = filesystemStreamsPath(filesystem);
    await exec({
      verbose: true,
      command: "sudo",
      // full paths to the first n streams:
      args: ["rm", "-f", ...streams.slice(0, n).map((x) => join(path, x))],
    });
    await exec({
      verbose: true,
      command: "sudo",
      args: ["mv", `${stream}.temp`, stream],
    });
  } catch (err) {
    await exec({
      verbose: true,
      command: "sudo",
      args: ["rm", "-f", `${stream}.temp`],
    });
    throw err;
  }
}

// Go through ALL filesystems with last_edited >= cutoff and send a stream if due,
// and also ensure number of streams isn't too large.
export async function maintainStreams(cutoff?: Date) {
  logger.debug("backupActiveFilesystems: getting...");
  const v = getRecent({ cutoff });
  logger.debug(`maintainStreams: considering ${v.length} filesystems`, cutoff);
  let i = 0;
  for (const { archived, last_edited, last_send_snapshot, ...pk } of v) {
    if (archived || !last_edited) {
      continue;
    }
    const age =
      new Date(last_edited).valueOf() - new Date(last_send_snapshot ?? 0).valueOf();
    if (age < STREAM_INTERVAL_MS) {
      // there's a new enough stream already
      continue;
    }
    try {
      await send(pk);
      await recompact({ ...pk, maxStreams: MAX_STREAMS });
    } catch (err) {
      logger.debug(`maintainStreams: error -- ${err}`);
    }
    i += 1;
    if (i % 10 == 0) {
      logger.debug(`maintainStreams: ${i}/${v.length}`);
    }
  }
}
