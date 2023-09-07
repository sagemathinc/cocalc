/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";
import { ID } from "./crm";

export type State = "off" | "starting" | "running" | "stopping" | "unknown";

export type Cloud =
  | "any"
  | "user"
  | "core-weave"
  | "lambda-cloud"
  | "gcp"
  | "aws"
  | "fluid-stack"
  | "test";

interface LambdaConfiguration {
  cloud: "lambda-cloud";
  instance_type_name: string;
  region_name: string;
}

export type Configuration = LambdaConfiguration;

export type Data = any;

export interface ComputeServer {
  id: number;
  account_id: string;
  project_id: string;
  name: string;
  color?: string;
  cost_per_hour?: number;
  deleted?: boolean;
  state_changed?: Date;
  started_by?: string;
  error?: string;
  state?: State;
  idle_timeout?: number;
  autorestart?: boolean;
  cloud: Cloud;
  configuration: Configuration;
  data?: Data;
}

Table({
  name: "compute_servers",
  rules: {
    primary_key: "id",
  },
  fields: {
    id: ID,
    account_id: {
      type: "uuid",
      desc: "User that owns this compute server.",
      render: { type: "account" },
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Name of this computer server.  Used purely to make it easier for the user to keep track of it.",
      render: { type: "text", maxLength: 254, editable: true },
    },
    color: {
      type: "string",
      desc: "A user configurable color, which is used for tags and UI to indicate where a tab is running.",
      pg_type: "VARCHAR(30)",
      render: { type: "color", editable: true },
    },
    cost_per_hour: {
      title: "Cost per Hour",
      desc: "The cost in US dollars per hour that this compute server cost us when it is run, the last time we started it.",
      type: "number",
      pg_type: "real",
    },
    deleted: {
      type: "boolean",
      desc: "True if the compute server has been deleted.",
    },
    project_id: {
      type: "uuid",
      desc: "The project id that this compute server provides compute for.",
    },
    state_changed: {
      type: "timestamp",
      desc: "When the state last changed.",
    },
    error: {
      type: "string",
      desc: "In case something went wrong, e.g., in starting this compute server, this field will get set with a string error message to show the user. It's also cleared right when we try to start server.",
    },
    state: {
      type: "string",
      desc: "One of - 'off', 'starting', 'running', 'stopping'",
      pg_type: "VARCHAR(16)",
    },
    idle_timeout: {
      type: "number",
      desc: "The idle timeout in seconds of this compute server. If set to 0, never turn it off automatically.  The compute server idle timeouts if none of the tabs it is providing are actively touched through the web UI.",
    },
    autorestart: {
      type: "boolean",
      desc: "If true and the compute server stops for any reason, then it will be automatically started again.  This is primarily useful for stop instances.",
    },
    cloud: {
      type: "string",
      pg_type: "varchar(30)",
      desc: "The cloud where this compute server runs: 'user', 'coreweave', 'lambda', 'gcp', 'aws', 'fluidstack'.",
    },
    configuration: {
      type: "map",
      pg_type: "jsonb",
      desc: "Cloud specific configuration of the computer at the cloud host. The format depends on the cloud",
    },
    data: {
      type: "map",
      pg_type: "jsonb",
      desc: "Arbitrary data about this server that is cloud provider specific.  Store data here to facilitate working with the virtual machine, e.g., the id of the server when it is running, etc.  This won't be returned to the user.",
    },
  },
});
