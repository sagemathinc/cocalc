/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const FAIR_CPU_MODE = true;

// IMPORTANT: If you change this file, also update this date, which
// appears in packages/landing/policies/pricing.pug

export const CURRENT_DATE = "September 2020";

// Define upgrades to projects.
//
// NOTE: This upgrade-spec is assumed as part of kucalc to be here; if you move
// or rename it you will break kucalc.

export const DEFAULT_QUOTAS = {
  disk_quota: 1000,
  cores: 1,
  cpu_shares: 0,
  memory: 1000,
  memory_request: 0,
  mintime: 1800, // 30 minutes
  network: 0,
  member_host: 0,
  ephemeral_state: 0,
  ephemeral_disk: 0,
  always_running: 0,
} as const;

// this is only for on-prem kubernetes setups
export const ON_PREM_DEFAULT_QUOTAS = {
  internet: true,
  idle_timeout: 60 * 60, // 1 hour
  mem: 1000,
  cpu: 1,
  cpu_oc: 10, // overcommitment ratio 10:1
  mem_oc: 5, // overcommitment ratio 5:1
} as const;

export const upgrades = {
  // these are the base quotas
  DEFAULT_QUOTAS: {
    disk_quota: 1000,
    cores: 1,
    cpu_shares: 0,
    memory: 1000,
    memory_request: 0,
    mintime: 1800, // 30 minutes
    network: 0,
    member_host: 0,
    ephemeral_state: 0,
    ephemeral_disk: 0,
    always_running: 0,
  },

  // type must be Upgrades (in @cocalc/util/upgrades/quota)
  // Check src/packages/util/upgrades/consts.ts for values used in the store!!!
  max_per_project: {
    disk_quota: 20000,
    memory: 16000,
    memory_request: 8000,
    cores: 3,
    network: 1,
    cpu_shares: 1024 * 2,
    mintime: 24 * 3600 * 90,
    member_host: 1,
    ephemeral_state: 1,
    ephemeral_disk: 1,
    always_running: 1,
  },

  // this is only for on-prem kubernetes setups
  ON_PREM_DEFAULT_QUOTAS: {
    internet: true,
    idle_timeout: 60 * 60, // 1 hour
    mem: 1000,
    cpu: 1,
    cpu_oc: 10, // overcommitment ratio 10:1
    mem_oc: 5, // overcommitment ratio 5:1
  },

  // In the params listed below you *MUST* define all of display, display_unit,
  // display_factor, pricing_unit, pricing_factor, input_type, and desc!   This
  // is assumed elsewhere.
  params: {
    disk_quota: {
      display: "Disk space",
      display_short: "Disk",
      unit: "MB",
      display_unit: "MB",
      display_factor: 1,
      pricing_unit: "G",
      pricing_factor: 1 / 1000,
      input_type: "number",
      desc: "The maximum amount of disk space (in MB) that a project may use.",
    },
    memory: {
      display: "Shared RAM",
      unit: "MB",
      display_unit: "MB",
      display_factor: 1,
      pricing_unit: "G",
      pricing_factor: 1 / 1000,
      input_type: "number",
      desc: "Upper bound on RAM that all processes in a project may use in total (shared with other projects; not guaranteed).",
    },
    memory_request: {
      display: "Dedicated RAM",
      unit: "MB",
      display_unit: "MB",
      display_factor: 1,
      pricing_unit: "G",
      pricing_factor: 1 / 1000,
      input_type: "number",
      desc: "Guaranteed minimum amount of RAM that is dedicated to your project.",
    },
    cores: {
      display: "Shared CPU",
      unit: "core",
      display_unit: "core",
      display_factor: 1,
      pricing_unit: "core",
      pricing_factor: 1,
      input_type: "number",
      desc: "Upper bound on the number of shared CPU cores that your project may use (shared with other projects; not guaranteed).",
    },
    cpu_shares: {
      display: "Dedicated CPU",
      unit: "core",
      display_unit: "core",
      display_factor: 1 / 1024,
      pricing_unit: "core",
      pricing_factor: 1 / 1024,
      input_type: "number",
      desc: "Guaranteed minimum number of CPU cores that are dedicated to your project.",
    },
    mintime: {
      display: "Idle timeout",
      display_short: "Timeout",
      unit: "second",
      display_unit: "hour",
      display_factor: 1 / 3600, // multiply internal by this to get what should be displayed
      pricing_unit: "day",
      pricing_factor: 1 / 86400,
      input_type: "number",
      desc: "If the project is not explicitly used via the web interface for this long, then it will be automatically stopped.",
    },
    network: {
      display: "Internet access",
      display_short: "Internet",
      unit: "internet upgrade",
      display_unit: "internet upgrade",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "checkbox",
      desc: "Full internet access enables a project to connect to the computers outside of CoCalc, download data, install software packages, etc.",
    },
    member_host: {
      display: "Member hosting",
      display_short: "Hosting",
      unit: "hosting upgrade",
      display_unit: "hosting upgrade",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "checkbox",
      desc: "Runs this project on a machine that hosts less projects, has no free trial projects, and is not randomly rebooted.",
    },
    always_running: {
      display: "Always running",
      display_short: "Always Up",
      unit: "always running upgrade",
      display_unit: "always running upgrade",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "checkbox",
      desc: "Ensures this project is always running.  If the project stops or crashes for any reason, it is automatically started again.",
    },
    ephemeral_state: {
      display: "Ephemeral state",
      unit: "state",
      display_unit: "state",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "checkbox",
      desc: "",
    },
    ephemeral_disk: {
      display: "Ephemeral disk",
      unit: "disk",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "checkbox",
      desc: "",
    },
    ext_rw: {
      display: "Read/write global files",
      unit: "read/write global files",
      display_unit: "read/write global files",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "checkbox",
      desc: "Allows you to read and write files in the global file system.",
    },
    patch: {
      display: "Patching project",
      unit: "patch",
      display_unit: "patch",
      display_factor: 1,
      pricing_unit: "project",
      pricing_factor: 1,
      input_type: "string",
      desc: "Modifies the project's specification how it runs in the cluster.",
    },
    gpu: {
      display: "GPU",
      unit: "GPU",
      display_unit: "GPU",
      display_factor: 1,
      pricing_unit: "GPU",
      pricing_factor: 1,
      input_type: "string",
      desc: "GPU support: if set, this requests access to a GPU in the cluster.",
    },
  },

  field_order: [
    "member_host",
    "network",
    "always_running",
    "mintime",
    "disk_quota",
    "memory",
    "memory_request",
    "cores",
    "cpu_shares",
  ],
} as const;
