/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This wraps a couple of static postgres connections in a "Pool",
// which does not clean up the session. This is different from pg.Pool!
// The technical reason is to keep the listen notifications open.
//
// TODO looking forward, a better strategy would be to split this up:
// i.e. use pg-pubsub for all listen notifications and pg.Pool for all standard queries.

interface Args {
  user: string;
  host: string;
  port: string;
  password: string;
  database: any;
  size: number;
}

export class PgStaticPool {
  constructor(args: Args) {
    const {} = args;
  }
}
