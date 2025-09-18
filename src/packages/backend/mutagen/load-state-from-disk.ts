/*
Assuming that mutagen is up and running and works,
this function ensures that the sync and forward
state of mutagen matches what is defined in the
variables sync and forward, which are arrays of:

export interface Sync {
  alpha: string;
  beta: string;
  flags?: string[];
}

// Forward is exactly what mutagen takes
export interface Forward {
  source: string;
  destination: string;
  flags?: string[];
}



*/

import { read } from "./config";
import { syncState } from "./sync-state";

export default async function loadStateFromDisk({
  home = process.env.HOME,
}: { home?: string } = {}) {
  const { sync, forward } = await read({ home });
  await syncState({ sync, forward });
}
