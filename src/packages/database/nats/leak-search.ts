/*
Code for testing for memory leaks.

  - just doing queries doesn't leak
  - as of this writing, creating the changefeed does leak.


USAGE:

Run with an account_id from your dev server and pass the expose-gc flag so the
gc command is defined:


ACCOUNT_ID="6aae57c6-08f1-4bb5-848b-3ceb53e61ede"  node  --expose-gc

Then do this

   a = require('@cocalc/database/nats/leak-search')
   await a.testQueryOnly(50)
   await a.testChangefeed(50)


*/

import { db } from "@cocalc/database";
import { uuid } from "@cocalc/util/misc";
//import { delay } from "awaiting";
import { callback2 } from "@cocalc/util/async-utils";

// set env variable to an account_id on your dev server with lots of projects.
const ACCOUNT_ID = process.env.ACCOUNT_ID;

export function create({ id, cb }: { id; cb? }) {
  const d = db();
  d.user_query({
    query: {
      projects_all: [
        { project_id: null, title: null, state: null, status: null },
      ],
    },
    changes: id,
    account_id: ACCOUNT_ID,
    cb: (err) => {
      cb?.(err);
      cb = undefined;
    },
  });
}

export function cancel(id) {
  db().user_query_cancel_changefeed({ id });
}

let pre: any = { heapUsed: 0 };
function before() {
  gc?.();
  pre = process.memoryUsage();
}

function after() {
  gc?.();
  const post = process.memoryUsage();
  const leak = (post.heapUsed - pre.heapUsed) / 10 ** 6;
  console.log("leaked", leak, "MB");
  return leak;
}

// This leaks horribly
export async function testChangefeed(n) {
  before();
  for (let i = 0; i < n; i++) {
    const id = uuid();
    await callback2(create, { id });
    cancel(id);
  }
  return after();
}

// query only does NOT leak
export async function testQueryOnly(n) {
  before();
  for (let i = 0; i < n; i++) {
    const d = db();
    await callback2(d.user_query, {
      query: {
        projects_all: [
          { project_id: null, title: null, state: null, status: null },
        ],
      },
      account_id: "6aae57c6-08f1-4bb5-848b-3ceb53e61ede",
    });
  }
  return after();
}
