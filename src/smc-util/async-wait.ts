/*
Wait until some function until of obj is truthy
(not truthy includes "throw an exception").

Waits until "until(obj)" evaluates to something truthy
in *seconds* -- set to 0 to disable (sort of DANGEROUS, obviously.)
Returns until(obj) on success and raises Error('timeout') or
Error('closed') on failure (closed if obj emits
'closed' event.

obj is an event emitter, and obj should emit change_event
whenever it changes.

obj should emit 'close' if it prematurely ends.

The until function may be async.
The timeout can be 0 to disable timeout.
*/

import { callback } from "awaiting";

import { EventEmitter } from "events";

interface WaitObject extends EventEmitter {
  get_state: Function;
}

export async function wait({
  obj,
  until,
  timeout,
  change_event
}: {
  obj: WaitObject;
  until: Function;
  timeout: number;
  change_event: string;
}): Promise<any> {
  let x = await until(obj);
  if (x) {
    // Already true -- done.
    return x;
  }

  function wait(cb): void {
    let fail_timer: any = undefined;

    function done(err, ret?): void {
      obj.removeListener(change_event, f);
      obj.removeListener("close", f);

      if (fail_timer !== undefined) {
        clearTimeout(fail_timer);
        fail_timer = undefined;
      }
      cb(err, ret);
    }

    async function f() {
      if (obj.get_state() === "closed") {
        done("closed");
        return;
      }
      try {
        x = await until(obj);
      } catch (err) {
        done(err);
        return;
      }
      if (x) {
        done(undefined, x);
      }
    }

    obj.on(change_event, f);
    obj.on("close", f);

    if (timeout) {
      const fail = () => {
        done("timeout");
      };
      fail_timer = setTimeout(fail, 1000 * timeout);
    }
  }

  return await callback(wait);
}
