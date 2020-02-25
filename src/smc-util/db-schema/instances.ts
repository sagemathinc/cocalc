/*
I think these two tables are is deprecated.
*/

import { Table } from "./types";

Table({
  name: "instances",
  rules: {
    primary_key: "name"
  },
  fields: {
    name: {
      type: "string"
    },
    gce: {
      type: "map"
    },
    gce_sha1: {
      type: "string"
    },
    requested_preemptible: {
      type: "boolean"
    },
    requested_status: {
      type: "string",
      desc: "One of 'RUNNING', 'TERMINATED'"
    },
    action: {
      type: "map",
      desc:
        "{action:'start', started:timestamp, finished:timestamp,  params:?, error:?, rule:?}",
      date: ["started", "finished"]
    }
  }
});

Table({
  name: "instance_actions_log",
  rules: {
    primary_key: "id"
  },
  fields: {
    id: {
      type: "uuid"
    },
    name: {
      type: "string",
      desc: "hostname of vm",
      pg_type: "VARCHAR(63)"
    },
    action: {
      type: "map",
      desc: "same as finished action object for instances above",
      date: ["started", "finished"]
    }
  }
});
