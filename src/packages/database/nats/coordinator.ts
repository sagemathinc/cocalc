/*
This is for managing who is responsible for each changefeed.

It stores:

- for each changefeed id, the managerId of who is manging it
- for each manager id, time when it last checked in

The manger checks in 2.5x every timeout period.
If a manger doesn't check in for the entire timeout period, then
they are considered gone.

DEVELOPMENT:

*/

import { dkv, type DKV } from "@cocalc/backend/nats/sync";
import { randomId } from "@cocalc/nats/names";
import getTime from "@cocalc/nats/time";

interface Entry {
  // last time user expressed interest in this changefeed
  user?: number;
  // manager of this changefeed.
  managerId?: string;
  // last time manager updated lock on this changefeed
  lock?: number;
}

function mergeTime(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  // time of interest should clearly always be the largest known value so far.
  if (a == null && b == null) {
    return undefined;
  }
  return Math.max(a ?? 0, b ?? 0);
}

function resolveMergeConflict(local: Entry, remote: Entry): Entry {
  const user = mergeTime(remote?.user, local?.user);
  let managerId = local.managerId ?? remote.managerId;
  if (
    local.managerId &&
    remote.managerId &&
    local.managerId != remote.managerId
  ) {
    // conflicting manager - winner is one with newest lock.
    if ((local.lock ?? 0) > (remote.lock ?? 0)) {
      managerId = local.managerId;
    } else {
      managerId = remote.managerId;
    }
  }
  const lock = mergeTime(remote?.lock, local?.lock);
  return { user, lock, managerId };
}

export const now = () => getTime({ noError: true });

const LIMITS = {
  // discard any keys that are 15 minutes old -- the lock and user interest
  // updates are much more frequently than this, but this keeps memory usage down.
  max_age: 1000 * 60 * 15,
};

export class Coordinator {
  public readonly managerId: string;
  public dkv?: DKV<Entry>;

  // if a manager hasn't update that it is managing this changefeed for timeout ms, then
  // the lock is relinquished.
  public readonly timeout: number;

  constructor({ timeout }: { timeout: number }) {
    this.managerId = randomId();
    this.timeout = timeout;
  }

  init = async () => {
    this.dkv = await dkv({
      name: "changefeed-manager",
      limits: LIMITS,

      merge: ({ local, remote }) => resolveMergeConflict(local, remote),
    });
  };

  close = async () => {
    await this.dkv?.close();
    delete this.dkv;
  };

  getManagerId = (id: string): string | undefined => {
    if (this.dkv == null) {
      throw Error("coordinator is closed");
    }
    const cur = this.dkv.get(id);
    if (cur == null) {
      return;
    }
    const { managerId, lock } = cur;
    if (!managerId || !lock) {
      return undefined;
    }
    if (lock < now() - this.timeout) {
      // lock is too old
      return undefined;
    }
    return managerId;
  };

  // update that this manager has the lock on this changefeed.
  lock = (id: string) => {
    if (this.dkv == null) {
      throw Error("coordinator is closed");
    }
    const x: Entry = this.dkv.get(id) ?? {};
    x.lock = now();
    x.managerId = this.managerId;
    this.dkv.set(id, x);
  };

  // ensure that this manager no longer has the lock
  unlock = (id: string) => {
    if (this.dkv == null) {
      throw Error("coordinator is closed");
    }
    const x: Entry = this.dkv.get(id) ?? {};
    if (x.managerId == this.managerId) {
      // we are the manager
      x.lock = 0;
      x.managerId = "";
      this.dkv.set(id, x);
      return;
    }
  };

  // user expresses interest in changefeed with given id,
  // which we may or may not be the manager of.
  updateUserInterest = (id: string) => {
    if (this.dkv == null) {
      throw Error("coordinator is closed");
    }
    const x: Entry = this.dkv.get(id) ?? {};
    x.user = now();
    this.dkv.set(id, x);
  };

  getUserInterest = (id: string): number => {
    if (this.dkv == null) {
      throw Error("coordinator is closed");
    }
    const { user } = this.dkv.get(id) ?? {};
    return user ?? 0;
  };
}
