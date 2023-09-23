/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";
import { ID } from "./crm";

export type State =
  | "off"
  | "starting"
  | "running"
  | "stopping"
  | "deleted"
  | "suspending"
  | "suspended"
  | "unknown";

export type Action =
  | "start"
  | "resume"
  | "stop"
  | "suspend"
  | "delete"
  | "reboot";

export const ACTION_INFO: { [action: string]: any } = {
  start: {
    label: "Start",
    icon: "play",
    tip: "Start running compute server",
    description:
      "Start the compute server running.  It will then connect to any notebooks or terminals that it is configured with.",
  },
  resume: {
    label: "Resume",
    icon: "play",
    clouds: ["google-cloud"],
    tip: "Resume running compute server",
    description: "Resume the compute server from suspend.",
  },
  stop: {
    label: "Stop",
    icon: "stop",
    tip: "Turn off compute server",
    description:
      "Turn the compute server off. No data on disk is lost, but any data and state in memory will be lost. This is like turning your laptop off completely.",
  },
  reboot: {
    label: "Reboot",
    icon: "refresh",
    tip: "Reboot the compute server",
    description:
      "Reboot the compute server, which shuts it down and boots it up.  No data on disk is lost, but any  state in memory will be lost. This is like turning your laptop off and on.",
  },
  suspend: {
    label: "Suspend",
    icon: "pause",
    clouds: ["google-cloud"],
    tip: "Suspend disk and memory state",
    description:
      "Suspend the compute server.  No data on disk or memory is lost, but the compute server pauses running and you are only charged for storing disk and memory. This is like closing your laptop screen.  You can leave a compute server suspended for at most 60 days.",
  },
  delete: {
    label: "Delete",
    icon: "trash",
    tip: "Delete this compute server completely.",
    description:
      "Deletes the compute server virtual memory.  All data on its disk and memory is lost, but the files in the home directory of your project are not affected.  You can start a deleted compute server and it comes up in a clean slate, and your configuration remains for use later.",
  },
};

export const STATE_INFO: {
  [state: string]: {
    label: string;
    actions: Action[];
    icon: string;
    color?: string;
  };
} = {
  off: {
    label: "Off",
    color: "#607d8b",
    actions: ["start", "delete"],
    icon: "stop",
  },
  suspended: {
    label: "Suspended",
    actions: ["resume"],
    icon: "pause",
    color: "#0097a7",
  },
  suspending: {
    label: "Suspending",
    actions: [],
    icon: "pause",
    color: "#00bcd4",
  },
  starting: {
    label: "Starting",
    color: "#388e3c",
    actions: [],
    icon: "bolt",
  },
  running: {
    label: "Running",
    color: "#389e0d",
    actions: ["stop", "suspend", "reboot"],
    icon: "run",
  },
  stopping: {
    label: "Stopping",
    color: "#ff9800",
    actions: [],
    icon: "hand",
  },
  unknown: {
    label: "Unknown",
    actions: [],
    icon: "question-circle",
  },
  resuming: {
    label: "Resuming",
    color: "#afb42c",
    actions: [],
    icon: "play",
  },
  deleted: {
    label: "Deleted",
    actions: ["start"],
    color: "#a1887f",
    icon: "trash",
  },
};

export type Cloud =
  | "any"
  | "user"
  | "core-weave"
  | "lambda-cloud"
  | "google-cloud"
  | "aws"
  | "fluid-stack"
  | "test";

// The ones that are at all potentially worth exposing to users.
export const CLOUDS: {
  [short: string]: {
    name: Cloud;
    label: string;
    image?: string;
    defaultConfiguration: Configuration;
  };
} = {
  google: {
    name: "google-cloud",
    label: "Google Cloud Platform",
    image:
      "https://www.gstatic.com/devrel-devsite/prod/v0e0f589edd85502a40d78d7d0825db8ea5ef3b99ab4070381ee86977c9168730/cloud/images/cloud-logo.svg",
    defaultConfiguration: {
      cloud: "google-cloud",
      region: "us-east1",
      zone: "us-east1-d",
      machineType: "c2-standard-4",
      spot: true,
      diskSizeGb: 50,
    },
  },
  lambda: {
    name: "lambda-cloud",
    label: "Lambda Cloud",
    image: "https://cloud.lambdalabs.com/static/images/lambda-logo.svg",
    defaultConfiguration: {
      cloud: "lambda-cloud",
      instance_type_name: "gpu_1x_a10",
      region_name: "us-west-1",
    },
  },
};

export const CLOUDS_BY_NAME: {
  [name: string]: {
    name: Cloud;
    label: string;
    image?: string;
    defaultConfiguration: Configuration;
  };
} = {};
for (const short in CLOUDS) {
  CLOUDS_BY_NAME[CLOUDS[short].name] = CLOUDS[short];
}

interface LambdaConfiguration {
  cloud: "lambda-cloud";
  instance_type_name: string;
  region_name: string;
}

const COREWEAVE_CPU_TYPES = [
  "amd-epyc-rome",
  "amd-epyc-milan",
  "intel-xeon-v1",
  "intel-xeon-v2",
  "intel-xeon-v3",
  "intel-xeon-v4",
  "intel-xeon-scalable",
] as const;

const COREWEAVE_GPU_TYPES = [
  "Quadro_RTX_4000",
  "Quadro_RTX_5000",
  "RTX_A4000",
  "RTX_A5000",
  "RTX_A6000",
  "A40",
  "Tesla_V100_PCIE",
  "Tesla_V100_NVLINK",
  "A100_PCIE_40GB",
  "A100_PCIE_80GB",
  "A100_NVLINK_40GB",
  "A100_NVLINK_80GB",
] as const;

interface CoreWeaveConfiguration {
  cloud: "core-weave";
  gpu: {
    type: (typeof COREWEAVE_GPU_TYPES)[number];
    count: number;
  };
  cpu: {
    count: number;
    type?: (typeof COREWEAVE_CPU_TYPES)[number];
  };
  memory: string; // e.g., "12Gi"
  storage?: {
    root: {
      size: string; // e.g., '40Gi'
    };
  };
}

interface FluidStackConfiguration {
  cloud: "fluid-stack";
  plan: string;
  region: string;
  os: string;
}

const GOOGLE_CLOUD_ACCELERATOR_TYPES = [
  "nvidia-a100-80gb",
  "nvidia-tesla-a100",
  "nvidia-l4",
  "nvidia-tesla-t4",
  "nvidia-tesla-v100",
  "nvidia-tesla-p4",
  "nvidia-tesla-p100",
  "nvidia-tesla-k80",
];

export interface GoogleCloudConfiguration {
  cloud: "google-cloud";
  region: string;
  zone: string;
  machineType: string;
  // Ues a spot instance if spot is true.
  spot?: boolean;
  // diskSizeGb is an integer >= 10.  It defaults to 10. It's the size of the boot disk.
  diskSizeGb?: number;
  acceleratorType?: (typeof GOOGLE_CLOUD_ACCELERATOR_TYPES)[number];
  // the allowed number depends on the accelerator; it defaults to 1.
  acceleratorCount?: number;
  // minCpuPlatform
  terminationTime?: Date;
  maxRunDurationSeconds?: number;
  // if true, use newest image, whether or not it is labeled with prod=true.
  test?: boolean;
  // an image name of the form "2023-09-13-063355-test", i.e., a timestamp in that format
  // followed by an optional string.  Whether or not to use cuda and and the arch are
  // determined by parameters above.  This is meant to be used for two purposes (1) testing
  // before deploying to production, and (2) stability, so a given compute server has the
  // exact same base image every time it is started, instead of being updated. Regarding (2),
  // this might not be needed, but we'll see.  If image is not set, we use the newest
  // image that is tagged prod:true, or its an error if no such image exists.
  image?: string;
}

export type Configuration =
  | LambdaConfiguration
  | CoreWeaveConfiguration
  | FluidStackConfiguration
  | GoogleCloudConfiguration;

export type Data = any;

export interface ComputeServerUserInfo {
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
  // google-cloud has a new "Time limit" either by hour or by date, which seems like a great idea!
  // time_limit
  autorestart?: boolean;
  cloud: Cloud;
  configuration: Configuration;
}

export interface ComputeServer extends ComputeServerUserInfo {
  data?: Data;
  api_key?: string; // project level api key for the project
  api_key_id?: number; // id of the api key (needed so we can delete it from database).
}

Table({
  name: "compute_servers",
  rules: {
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        throttle_changes: 2000,
        fields: {
          id: null,
          account_id: null,
          name: null,
          color: null,
          cost_per_hour: null,
          deleted: null,
          project_id: null,
          state_changed: null,
          error: null,
          state: null,
          idle_timeout: null,
          autorestart: null,
          cloud: null,
          configuration: null,
          avatar_image_tiny: null,
        },
      },
    },
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
    api_key: {
      type: "string",
      pg_type: "VARCHAR(128)",
      desc: "api key to connect to the project.  This is created by the system right when we are going to create the VM, and gets deleted when we stop it.  It's not set by the user and should not be revealed to the user.",
    },
    api_key_id: {
      type: "number",
      desc: "id of the api key; needed so we can delete it from database",
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
      desc: "The cloud where this compute server runs: 'user', 'coreweave', 'lambda', 'google-cloud', 'aws', 'fluidstack'.",
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
    avatar_image_tiny: {
      title: "Image",
      type: "string",
      desc: "tiny (32x32) visual image associated with the compute server. Suitable to include as part of changefeed, since about 3kb. Derived from avatar_image_full.",
      render: { type: "image" },
    },
    avatar_image_full: {
      title: "Image",
      type: "string",
      desc: "User configurable visual image associated with the compute server.  Could be 150kb.  NOT include as part of changefeed of projects, since potentially big (e.g., 200kb x 1000 projects = 200MB!).",
      render: { type: "image" },
    },
  },
});
