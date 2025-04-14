/*
This is for managing who is responsible for each changefeed.

It stores:

- for each changefeed id, the managerId of who is manging it
- for each manager id, time when it last checked in

The manger checks in 2.5x every timeout period.
If a manger doesn't check in for the entire timeout period, then
they are considered gone.

DEVELOPMENT:

~/cocalc/src/packages/database/nats$ node
> m1 = new (require('@cocalc/database/nats/coordinator').Coordinator)(); m2 = new (require('@cocalc/database/nats/coordinator').Coordinator)(); null
null
> await m1.owner('foo')
undefined
> await m1.take('foo')
undefined
> await m1.owner('foo')
'l7ZjMufim9'
> await m2.owner('foo')
'l7ZjMufim9'
> await m2.take('foo')
Uncaught Error: foo is locked by another manager
> await m1.free('foo')
> await m2.take('foo')
undefined
> await m1.owner('foo')
'So01mDRsbs'
*/

import { akv, type AKV } from "@cocalc/backend/nats/sync";
import { randomId } from "@cocalc/nats/names";
import getTime from "@cocalc/nats/time";

const TIMEOUT = parseInt(process.env.COCALC_CHANGEFEED_TIMEOUT ?? "15000");
//const TIMEOUT = 3000;

export const now = () => getTime({ noError: true });

export class Coordinator {
  public readonly managerId: string;
  public readonly akv: AKV;
  public readonly timeout: number;
  private interval;

  constructor({ timeout = TIMEOUT }: { timeout?: number } = {}) {
    this.managerId = randomId();
    // noChunks true because we don't have any large values, and it is MASSIVELY
    // more efficient.
    this.akv = akv({ name: "changefeeds", noChunks: true });
    this.timeout = timeout;
    this.interval = setInterval(this.checkin, this.timeout / 2.5);
    this.checkin();
  }

  close = async () => {
    if (this.interval) {
      clearInterval(this.interval);
      delete this.interval;
    }
    await this.akv.delete(this.managerId);
  };

  private checkin = async () => {
    await this.akv.set(this.managerId, now());
  };

  getManager = async (id: string): Promise<string | undefined> => {
    const { managerId } = (await this.akv.get(id)) ?? {};
    if (!managerId) {
      return undefined;
    }
    const time = await this.akv.get(managerId);
    if (!time) {
      return undefined;
    }
    if (time < now() - this.timeout) {
      return undefined;
    }
    return managerId;
  };

  // use expresses interest in changefeed with given id,
  // which we may or may not be the manager of.
  userInterest = async (id: string) => {
    const x = await this.akv.get(id);
    if (!x) {
      return;
    }
    x.time = now();
    await this.akv.set(id, x);
  };

  lastUserInterest = async (id: string): Promise<number> => {
    const { time } = (await this.akv.get(id)) ?? { time: 0 };
    return time;
  };

  takeManagement = async (id: string) => {
    const cur = await this.getManager(id);
    if (cur && cur != this.managerId) {
      throw Error(`${id} is locked by another manager`);
    }
    const previousSeq = await this.akv.seq(id);
    // console.log("takeManagement", { previousSeq });
    await this.akv.set(
      id,
      {
        time: now(),
        managerId: this.managerId,
      },
      { previousSeq },
    );

    const m = await this.getManager(id);
    if (m != this.managerId) {
      throw Error("unable to get lock");
    }
  };
}
