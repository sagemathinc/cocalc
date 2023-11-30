/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";
import { ID } from "./crm";
import { NOTES } from "./crm";
import { SCHEMA as schema } from "./index";

// These are just fallbacks in case something is wrong with the image configuration.
export const STANDARD_DISK_SIZE = 20;
export const CUDA_DISK_SIZE = 60;

// Compute Server Images

// for now the versions must be sorted from oldest to newest.
type VERSIONS = { label: string; tag: string }[];

interface ImageBase {
  label: string;
  docker: string;
  minDiskSizeGb: number;
  dockerSizeGb: number;
  description?: string;
  url: string;
  icon: string;
  source: string;
  versions: VERSIONS;
  authToken?: boolean; // if true, image has web interface that supports configurable auth token
}

interface NonGPUImage extends ImageBase {
  gpu: false;
}

export type CudaVersion = string;

interface GPUImage extends ImageBase {
  gpu: true;
  cudaVersion?: CudaVersion;
}

type Image = NonGPUImage | GPUImage;

export const DOCKER_USER = "sagemathinc";

export const IMAGES0 = {
  python: {
    label: "Python",
    docker: `${DOCKER_USER}/python`,
    minDiskSizeGb: 10,
    dockerSizeGb: 2,
    gpu: false,
    icon: "python",
    // TODO -- should be a much better
    url: "https://www.python.org/",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/python",
    // TODO: I don't like the tag/version here.
    versions: [{ label: "3.10.12", tag: "latest" }],
    description:
      "[Python](https://python.org) is a versatile and user-friendly programming language, known for its clear syntax and readability. It is widely used for web development, data analysis, artificial intelligence, and scientific computing.",
  },
  sagemath: {
    label: "SageMath",
    docker: `${DOCKER_USER}/sagemath`,
    minDiskSizeGb: 20, // 14 doesn't work.
    dockerSizeGb: 9,
    gpu: false,
    icon: "sagemath",
    url: "https://www.sagemath.org/",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/sagemath-10.1",
    versions: [{ label: "10.1", tag: "10.1" }],
    description:
      "[SageMath](https://sagemath.org) is an open-source mathematics software system, integrating numerous software packages and providing a unified interface. It is designed for advanced algebra, geometry, number theory, cryptography, and various other fields of mathematics, accessible through a Python-based language.",
  },
  rstats: {
    label: "R",
    docker: `${DOCKER_USER}/rstats`,
    minDiskSizeGb: 10,
    dockerSizeGb: 3,
    gpu: false,
    icon: "r",
    url: "https://www.r-project.org/",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/rstats",
    versions: [{ label: "4.3.2", tag: "4.3.2" }],
    description:
      "[R](https://www.r-project.org/) is a powerful statistical computing language and environment, widely used for data analysis, statistical modeling, and visualization. Its extensive package ecosystem and flexible scripting capabilities make it ideal for both simple and complex data exploration tasks.",
  },
  julia: {
    label: "Julia",
    docker: `${DOCKER_USER}/julia`,
    minDiskSizeGb: 10,
    dockerSizeGb: 3,
    gpu: false,
    icon: "julia",
    url: "https://julialang.org/",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/julia",
    versions: [{ label: "1.9.4", tag: "1.9.4" }],
    description:
      "[Julia](https://julialang.org/) is a high-performance programming language designed for technical computing, combining the speed of C with the ease of use of Python. It excels in numerical analysis, computational science, and data processing with its efficient syntax and ability to handle high-level mathematical operations.",
  },
  //   anaconda: {
  //     label: "Anaconda",
  //     docker: `${DOCKER_USER}/anaconda`,
  //     minDiskSizeGb: 10,
  //     dockerSizeGb: 2,
  //     gpu: false,
  //     icon: "python",
  //     url: "https://www.sagemath.org/",
  //     source:
  //       "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/anaconda",
  //     description:
  //       "Minimal Anaconda environment nicely setup and ready for you to install packages into.",
  //     versions: [{ label: "2023-11-26", tag: "2023-11-26" }],
  //   },
  cuda: {
    label: "CUDA Development Toolkit",
    docker: `${DOCKER_USER}/cuda`,
    gpu: true,
    // have to add 10 for CUDA base drivers
    minDiskSizeGb: 13 + 10 + 10,
    dockerSizeGb: 8,
    icon: "nvidia",
    url: "https://catalog.ngc.nvidia.com/orgs/nvidia/containers/cuda",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/cuda",
    description:
      "The CUDA Toolkit from NVIDIA provides everything you need to develop GPU-accelerated applications.  The CUDA Toolkit includes GPU-accelerated libraries, a compiler, development tools and the CUDA runtime.   It enables dramatic increases in computing performance by harnessing the power of NVIDIA graphics processing units (GPUs) for a wide range of computing tasks.",
    versions: [{ label: "12.3.0", tag: "12.3.0-devel-ubuntu22.04" }],
  },
  pytorch: {
    label: "PyTorch",
    docker: `${DOCKER_USER}/pytorch`,
    gpu: true,
    minDiskSizeGb: 29 + 10 + 10,
    dockerSizeGb: 24,
    url: "https://catalog.ngc.nvidia.com/orgs/nvidia/containers/pytorch",
    icon: "pytorch",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/pytorch",
    versions: [{ label: "2.1.0a0+32f93b1", tag: "23.10-py3" }],
    description:
      "[PyTorch](https://pytorch.org/) is an open-source machine learning library, known for its flexibility and ease of use, particularly in deep learning applications. It provides a dynamic computation graph and a rich ecosystem of tools and libraries, making it a preferred choice for researchers and developers in AI.",
  },
  tensorflow: {
    label: "Tensorflow",
    docker: `${DOCKER_USER}/tensorflow`,
    gpu: true,
    minDiskSizeGb: 28 + 10 + 10,
    dockerSizeGb: 23,
    url: "https://catalog.ngc.nvidia.com/orgs/nvidia/containers/tensorflow",
    icon: "tensorflow",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/tensorflow",
    versions: [{ label: "2.13.0", tag: "23.10-tf2-py3" }],
    description:
      "[TensorFlow](https://www.tensorflow.org/) is an open-source machine learning framework developed by Google, widely used for building and training neural networks. Its flexible architecture allows for easy deployment of computation across various platforms, from servers to edge devices, making it suitable for a broad range of AI applications.",
  },
  colab: {
    label: "Google Colab",
    docker: `${DOCKER_USER}/colab`,
    minDiskSizeGb: 33 + 10 + 10,
    dockerSizeGb: 28,
    gpu: true,
    icon: "google",
    url: "https://github.com/googlecolab",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/colab",
    versions: [
      {
        label: "2023-09-21",
        tag: "release-colab_20230921-060057_RC00",
      },
    ],
    description:
      "[Google Colab](https://colab.google/) comes preinstalled with a wide range of popular data science and machine learning libraries, such as TensorFlow, PyTorch, Matplotlib, and Pandas. It also includes support for Python and its various packages, enabling users to jump straight into coding without worrying about setup and installation.",
  },
  ollama: {
    label: "Ollama with WebUI",
    docker: `${DOCKER_USER}/ollama`,
    dockerSizeGb: 2,
    minDiskSizeGb: 30,
    gpu: true,
    icon: "robot",
    url: "https://ollama.ai/",
    source:
      "https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/ollama",
    description:
      "[Ollama](https://ollama.ai/) makes it very easy to run Llama 2, code Llama, and [hundreds of other models](https://ollama.ai/library).  Use the [web interface](https://github.com/ollama-webui/ollama-webui#readme) or call ollama from the Python API.",
    authToken: true,
    versions: [{ label: "0.1.12", tag: "0.1.12.p2" }],
  },

  //   "cocalc-docker": {
  //     label: "CoCalc - Personal Server",
  //     docker: `${DOCKER_USER}/cocalc-docker`,
  //     minDiskSizeGb: 50,
  //   },
};

export type ImageName = keyof typeof IMAGES0;

export const IMAGES = IMAGES0 as { [name: string]: Image };

// This is entirely to force the values to be type checked,
// but without having to explicitly type IMAGES above, so
// the key types can be got with 'keyof typeof IMAGES',
// thus avoiding typing the key names twice!
export const __IMAGES: { [name: string]: Image } = IMAGES;

export type State =
  | "off"
  | "starting"
  | "running"
  | "stopping"
  | "deprovisioned"
  | "suspending"
  | "suspended"
  | "unknown";

export type Action =
  | "start"
  | "resume"
  | "stop"
  | "suspend"
  | "deprovision"
  | "reboot";

export const ACTION_INFO: {
  [action: string]: {
    label: string;
    icon: string;
    tip: string;
    description: string;
    confirm?: boolean;
    confirmMessage?: string;
    danger?: boolean;
    target: State; // target stable state after doing this action.
    clouds?: Cloud[];
  };
} = {
  start: {
    label: "Start",
    icon: "play",
    tip: "Start",
    description: "Start the compute server running.",
    target: "running",
  },
  resume: {
    label: "Resume",
    icon: "play",
    clouds: ["google-cloud"],
    tip: "Resume",
    description: "Resume the compute server from suspend.",
    target: "running",
  },
  stop: {
    label: "Stop",
    icon: "stop",
    tip: "Turn off",
    description:
      "Turn the compute server off. No data on disk is lost, but any data and state in memory will be lost. This is like turning your laptop off.",
    confirm: true,
    target: "off",
  },
  deprovision: {
    label: "Deprovision",
    icon: "trash",
    tip: "Deprovision the virtual machine",
    description:
      "Deprovisioning DELETES THE VIRTUAL MACHINE BOOT DISK, but keeps the compute server parameters.   There are no costs associated with a deprovisioned compute server, and you can move it to a different region or zone.  Any files in the home directory of your project are not affected.",
    confirm: true,
    confirmMessage: "I understand that my compute server disk will be deleted.",
    danger: true,
    target: "deprovisioned",
  },
  reboot: {
    label: "Hard Reboot",
    icon: "refresh",
    tip: "Hard reboot the virtual machine.",
    description:
      "Perform a HARD reset on the virtual machine, which wipes the memory contents and resets the virtual machine to its initial state. This should not delete data from the disk, but can lead to filesystem corruption.",
    confirm: true,
    confirmMessage:
      "I understand that this can lead to filesystem corruption and is slightly dangerous.",
    danger: true,
    target: "running",
    clouds: ["google-cloud"],
  },
  suspend: {
    label: "Suspend",
    icon: "pause",
    clouds: ["google-cloud"],
    tip: "Suspend disk and memory state",
    confirm: true,
    description:
      "Suspend the compute server.  No data on disk or memory is lost, and you are only charged for storing disk and memory. This is like closing your laptop screen.  You can leave a compute server suspended for up to 60 days before it automatically shuts off.",
    target: "suspended",
  },
};

export const STATE_INFO: {
  [state: string]: {
    label: string;
    actions: Action[];
    icon: string;
    color?: string;
    stable?: boolean;
    target?: State; // if not stable, this is the target state it is heading to
  };
} = {
  off: {
    label: "Off",
    color: "#ff4b00",
    actions: ["start", "deprovision"],
    icon: "stop",
    stable: true,
  },
  suspended: {
    label: "Suspended",
    actions: ["resume", "deprovision", "stop"],
    icon: "pause",
    color: "#0097a7",
    stable: true,
  },
  suspending: {
    label: "Suspending",
    actions: ["suspend"],
    icon: "pause",
    color: "#00bcd4",
    stable: false,
    target: "suspended",
  },
  starting: {
    label: "Starting",
    color: "#388e3c",
    actions: ["start"],
    icon: "bolt",
    stable: false,
    target: "running",
  },
  running: {
    label: "Running",
    color: "#389e0d",
    actions: ["stop", "deprovision", "reboot", "suspend"],
    icon: "run",
    stable: true,
  },
  stopping: {
    label: "Stopping",
    color: "#ff9800",
    actions: ["stop"],
    icon: "hand",
    stable: false,
    target: "off",
  },
  unknown: {
    label: "Unknown (click to refresh)",
    actions: [],
    icon: "question-circle",
    stable: true,
  },
  deprovisioned: {
    label: "Deprovisioned",
    actions: ["start"],
    color: "#888",
    icon: "minus-square",
    stable: true,
  },
};

export function getTargetState(x: State | Action): State {
  if (ACTION_INFO[x] != null) {
    return ACTION_INFO[x].target;
  }
  if (STATE_INFO[x] != null) {
    if (!STATE_INFO[x]?.stable) {
      return (STATE_INFO[x].target ?? x) as State;
    }
    return x as State;
  }
  throw Error(`x =${x} must be a state or action`);
}

export type Architecture = "x86_64" | "arm64";

// This same convention is used in cocalc-compute-docker for making
// the npm packages @cocalc/compute-server.  Don't mess with it!
export function getImagePostfix(arch: Architecture) {
  return arch == "x86_64" ? "" : "-arm64";
}

export type Cloud =
  | "any"
  | "onprem"
  | "core-weave"
  | "lambda-cloud"
  | "google-cloud"
  | "aws"
  | "fluid-stack"
  | "test";

export function getMinDiskSizeGb(configuration) {
  if (configuration?.image) {
    const { minDiskSizeGb } = IMAGES[configuration.image] ?? {};
    if (minDiskSizeGb) {
      return minDiskSizeGb;
    }
  }
  // TODO: will have to do something based on actual image size, maybe, unless I come up with a clever trick involving
  // one PD mounted on many machines (?).
  if (configuration?.acceleratorType) {
    return CUDA_DISK_SIZE;
  } else {
    return STANDARD_DISK_SIZE;
  }
}

// I think it could be very confusing to have anything
// here by default, since most people won't even know
// about excludes, and will just think sync is broken
// if a random default folder is excluded!
const DEFAULT_EXCLUDE_FROM_SYNC = [] as const;

export const GOOGLE_CLOUD_DEFAULTS = {
  cpu: {
    image: "python",
    cloud: "google-cloud",
    region: "us-east5",
    zone: "us-east5-a",
    machineType: "n2d-standard-4",
    spot: true,
    diskSizeGb: getMinDiskSizeGb({ image: "python" }),
    diskType: "pd-balanced",
    externalIp: true,
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
  gpu: {
    image: "pytorch",
    spot: true,
    region: "asia-northeast1",
    cloud: "google-cloud",
    zone: "asia-northeast1-a",
    diskType: "pd-balanced",
    diskSizeGb: getMinDiskSizeGb({ image: "pytorch" }) + 10,
    externalIp: true,
    machineType: "n1-highmem-2",
    acceleratorType: "nvidia-tesla-t4",
    acceleratorCount: 1,
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
  gpu2: {
    image: "pytorch",
    spot: true,
    zone: "us-central1-b",
    cloud: "google-cloud",
    region: "us-central1",
    diskType: "pd-balanced",
    diskSizeGb: getMinDiskSizeGb({ image: "pytorch" }) + 10,
    externalIp: true,
    machineType: "g2-standard-4",
    acceleratorType: "nvidia-l4",
    acceleratorCount: 1,
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
} as const;

// The ones that are at all potentially worth exposing to users.
const CLOUDS: {
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
    defaultConfiguration: GOOGLE_CLOUD_DEFAULTS.cpu,
  },
  lambda: {
    name: "lambda-cloud",
    label: "Lambda Cloud",
    image: "https://cloud.lambdalabs.com/static/images/lambda-logo.svg",
    defaultConfiguration: {
      cloud: "lambda-cloud",
      image: "python",
      instance_type_name: "gpu_1x_a10",
      region_name: "us-west-1",
      excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
    },
  },
  onprem: {
    name: "onprem",
    label: "On Prem",
    defaultConfiguration: {
      cloud: "onprem",
      image: "python",
      arch: "x86_64",
      gpu: false,
      excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
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

interface BaseConfiguration {
  // If the string is set and the VM has an external ip address
  // and dns is configured, then point https://{dns}....
  // with ssl proxying to this compute server when it is running.
  dns?: string;
  image?: ImageName;
  // Array of top level directories to exclude from sync.
  // These can't have "|" in them, since we use that as a separator.
  // Use "~" to completely disable sync.
  excludeFromSync?: readonly string[];
  // If true, view data on the compute server as ephemeral.
  // Currently this is only meant to impact the user interface.
  ephemeral?: boolean;
  // Token used for authentication at https://compute-server...
  authToken?: string;
}

interface LambdaConfiguration extends BaseConfiguration {
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

interface CoreWeaveConfiguration extends BaseConfiguration {
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

interface FluidStackConfiguration extends BaseConfiguration {
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
];

const GOOGLE_CLOUD_DISK_TYPES = ["pd-standard", "pd-balanced", "pd-ssd"];

export interface GoogleCloudConfiguration extends BaseConfiguration {
  cloud: "google-cloud";
  region: string;
  zone: string;
  machineType: string;
  // Ues a spot instance if spot is true.
  spot?: boolean;
  // The boot disk:
  // diskSizeGb is an integer >= 10.  It defaults to 10. It's the size of the boot disk.
  diskSizeGb?: number;
  diskType?: (typeof GOOGLE_CLOUD_DISK_TYPES)[number];
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
  // image that is tagged prod:true, or its an error if no such image exists.  This is
  // all about Google Cloud images, not the IMAGES object defined elsewhere in this file.
  sourceImage?: string;
  // If true, then we have an external ip address
  externalIp?: boolean;
}

export interface OnPremCloudConfiguration extends BaseConfiguration {
  cloud: "onprem";
  arch?: Architecture;
  gpu?: boolean;
}

export type Configuration =
  | LambdaConfiguration
  | CoreWeaveConfiguration
  | FluidStackConfiguration
  | GoogleCloudConfiguration
  | OnPremCloudConfiguration;

interface BaseData {
  cloudflareId: string;
}

export interface LambdaCloudData extends BaseData {
  type: "lambda-cloud";
  instance_id: string;
}

export interface GoogleCloudData extends BaseData {
  type: "google-cloud";
  name?: string;
  state?: State;
  externalIp?: string;
  internalIp?: string;
  cpuPlatform?: string;
  creationTimestamp?: Date;
  lastStartTimestamp?: Date;
}

export type Data = GoogleCloudData | LambdaCloudData;

export interface ComponentState {
  state: string;
  time: number;
  expire?: number;
}

export interface ComputeServerUserInfo {
  id: number;
  account_id: string;
  project_id: string;
  title?: string;
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
  provisioned_configuration?: Configuration;
  data?: Data;
  purchase_id?: number;
  last_edited?: Date;
  position?: number; // used for UI sorting.
  detailed_state?: { [name: string]: ComponentState };
  update_purchase?: boolean;
  last_purchase_update?: Date;
}

export interface ComputeServer extends ComputeServerUserInfo {
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
        throttle_changes: 0, // do not make this bigger; UI really feels off if throttled
        fields: {
          id: null,
          account_id: null,
          title: null,
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
          data: null,
          provisioned_configuration: null,
          avatar_image_tiny: null,
          last_edited: null,
          purchase_id: null,
          position: null,
          detailed_state: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          id: true,
          position: true,
          error: true, // easily clear the error
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
    title: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Title of this computer server.  Used purely to make it easier for the user to keep track of it.",
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
      desc: "The cost in US dollars per hour that this compute server cost us when it is provisioned. Any time the state is changed, this is set by the server to the proper cost.",
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
      render: { type: "project_link" },
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
      desc: "One of - 'off', 'starting', 'running', 'stopping'.  This is the underlying VM's state.",
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
    provisioned_configuration: {
      type: "map",
      pg_type: "jsonb",
      desc: "Same as configuration, but this is the one we actually used last time we provisioned a VM in a cloud.",
    },
    data: {
      type: "map",
      pg_type: "jsonb",
      desc: "Arbitrary data about this server that is cloud provider specific.  Store data here to facilitate working with the virtual machine, e.g., the id of the server when it is running, etc.  This *IS* returned to the user.",
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
    purchase_id: {
      type: "number",
      desc: "if there is a current active purchase related to this compute server, this is the id of that purchase in the purchases table",
    },
    update_purchase: {
      type: "boolean",
      desc: "This is set to true if activity with this server is happening that warrants creating/ending a purchase.",
    },
    last_purchase_update: {
      type: "timestamp",
      desc: "Last time we requested an update to the purchase info about this compute server.",
    },
    position: {
      type: "number",
      desc: "Used for sorting a list of compute servers in the UI.",
    },
    last_edited: {
      type: "timestamp",
      desc: "Last time the configuration, state, etc., changed.",
    },
    detailed_state: {
      type: "map",
      pg_type: "jsonb",
      desc: "Map from component name to something like {state:'running',time:Date.now()}, e.g., {vm: {state:'running', time:393939938484}}, filesystem: {state:'updating', time:939398484892}, uptime:{state:'22:56:33 up 3 days,  9:28,  0 users,  load average: 0.93, 0.73, 0.56', time:?}}.  This is used to provide users with insight into what's currently happening on their compute server.",
    },
    notes: NOTES,
  },
});

Table({
  name: "crm_compute_servers",
  fields: schema.compute_servers.fields,
  rules: {
    primary_key: schema.compute_servers.primary_key,
    virtual: "compute_servers",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        // (without this, users who have read access could read)
        pg_where: [],
        fields: {
          ...schema.compute_servers.user_query?.get?.fields,
          notes: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          title: true,
          color: true,
          deleted: true,
          notes: true,
        },
      },
    },
  },
});
