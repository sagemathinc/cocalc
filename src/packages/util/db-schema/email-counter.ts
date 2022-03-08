/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "email_counter",
  fields: {
    id: {
      type: "uuid",
      desc: "The project, account or owner id.  Who 'caused' these emails to get sent.",
    },
    count: {
      type: "integer",
      desc: "How many messages have been sent with given time.",
    },
    time: {
      type: "timestamp",
      desc: "Start of the time interval when these emails were sent (e.g., start of the day if we are counting up for a single day).",
    },
    expire: {
      type: "timestamp",
    },
  },
  rules: {
    // using a compound primary key consisting of who and day we start.
    primary_key: ["id", "time"],
  },
});
