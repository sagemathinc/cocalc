/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Compute project quotas based on:

    - settings:
        - by admins
        - system-wide customizable site defaults
        - overcommit ratios
        - maximum overall limits

2021-04-08: a messy "version 1" patchwork code was replaced by a cleaner implementation.
            see rev 19967bb82083b398 for the previous code.
*/

// TODO: relative path just needed in manage-*

import type { ProjectQuota as PayAsYouGoQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { GPU } from "@cocalc/util/types/gpu";
import { DEFAULT_QUOTAS, upgrades } from "@cocalc/util/upgrade-spec";
import { deep_copy, test_valid_jsonpatch } from "../misc";

const MAX_UPGRADES = upgrades.max_per_project;

interface Limit {
  readonly member: number;
  readonly nonmember: number;
}

// No matter what, every project gets SOME possibly tiny amount of guaranteed cpu.
// This is important since otherwise projects will NOT start at all, e.g., if a paying
// customer is using 100% of the cpu on the node (this will happen if their limits are
// high and they have guaranteed cpu of about 1 or more).  The project will be so slow
// it fails to start in time and times out.
const MIN_POSSIBLE_CPU: Limit = Object.freeze({
  member: 0.05,
  nonmember: 0.02,
});

// Min possible **guaranteed** RAM.
const MIN_POSSIBLE_MEMORY: Limit = Object.freeze({
  member: 300,
  nonmember: 200,
});

// lower bound for the RAM "limit"
// in particular, we make sure member projects are above the free quota
// 20220601: for years we gave away 1.5x the default quota for members, even if we only sold a 1gb upgade.
//           We stopped doing this as part of a price increase, and instead configure exactly what we sell.
//           We also enahanced the OOM banner with note about upgrading the project or boosting a license.
const MIN_MEMORY_LIMIT: Limit = Object.freeze({
  member: DEFAULT_QUOTAS.memory,
  nonmember: DEFAULT_QUOTAS.memory,
});

type NumParser = (s: string | number | undefined) => number;
type Str2Num = (s: string | number) => number;

// this is the resulting quota, which is used in production
interface QuotaBase {
  network?: boolean;
  member_host?: boolean;
  always_running?: boolean;
  disk_quota?: number;
  memory_limit?: number;
  memory_request?: number;
  cpu_limit?: number;
  cpu_request?: number;
  privileged?: boolean;
  idle_timeout?: number;
  pay_as_you_go?: null | {
    account_id: string;
    purchase_id: number;
    quota: PayAsYouGoQuota;
  };
}

// additional fields of the quota result, which are used for onprem (cocalc-onprem) applications
interface QuotaOnPrem {
  ext_rw?: boolean;
  patch?: { [key: string]: string | object }[];
  gpu?: GPU | boolean;
}

// the resulting quota is a combination of the base quota and the onprem specific one
export type Quota = QuotaBase & QuotaOnPrem;

// the output is *required* to have all fields of base quota set, and optionally the on-prem specific ones
type RQuota = Required<QuotaBase> & QuotaOnPrem;

// all are optional!
interface Settings {
  cores?: number;
  cpu_shares?: number;
  mintime?: number;
  memory?: number;
  memory_request?: number;
  disk_quota?: number; // sometimes a string, sanitized very early!
  member_host?: number;
  privileged?: number;
  network?: number;
  always_running?: number;
}

export interface Upgrades {
  cores: number;
  cpu_shares: number; // 1024
  mintime: number;
  memory: number;
  memory_request: number;
  network: number;
  disk_quota: number;
  member_host: number;
  privileged?: number;
  always_running: number;
  ephemeral_state: number;
  ephemeral_disk: number;
  ext_rw?: number;
  patch?: Patch;
  gpu?: GPU;
}

// this is onprem specific only!
// this server setting configuration "default_quotas" is stored in the database
// and used by the manage process to configure default quotas of projects.
export interface DefaultQuotaSetting {
  cpu: number; // limit cpu, usually 1
  cpu_oc: number; // overcommit ratio for CPU, e.g 10: means 1/10 is requested
  idle_timeout: number; // seconds
  internet: boolean; // usually true
  mem: number; // memory limit in MB
  mem_oc: number; // overcommit ratio to derive memory request (e.g. 5 = 5x overcommit)
}

// upgrade raw data from users: {"<uuid4>": {"group": ...,
// "upgrades":
// {"cores": 0, "memory": 3000, "mintime": 86400, "network": 1,
//  "cpu_shares": 0, "disk_quota": 5000, "member_host": 1, "always_running": 0,
//  "ephemeral_disk": 0, "memory_request": 0, "ephemeral_state": 0
// }}

interface Users {
  [userid: string]: {
    upgrades?: Upgrades;
  };
}

// special quotas for on-prem setups.
// They not only set different defaults,
// but also tune some aspects of the overall behavior.
interface SiteSettingsDefaultQuotas {
  internet: boolean; // true, allow project pods to access the internet
  idle_timeout: number; // overrides DEFAULT_QUOTAS.mintime
  cpu: number; // shared cpu quota, in 1 core units, overrides DEFAULT_QUOTAS.cores
  cpu_oc: number; // overcommitment ratio for cpu, 1:cpu_oc
  mem: number; // shared memory quota, in mb, overrides DEFAULT_QUOTAS.memory
  mem_oc: number; // overcommitment ratio for memory, 1:mem_oc
  disk_quota: number; // overrides DEFAULT_QUOTAS.disk_quota
}

/*
 * default quotas: {"internet":true,"mintime":3600,"mem":1000,"cpu":1,"cpu_oc":10,"mem_oc":5}
 * max_upgrades: Quota
 */
export interface SiteSettingsQuotas {
  default_quotas?: Partial<SiteSettingsDefaultQuotas>;
  max_upgrades?: Partial<Upgrades>;
}

const ZERO_QUOTA: RQuota = {
  network: false,
  member_host: false,
  privileged: false,
  memory_request: 0,
  cpu_request: 0,
  disk_quota: 0,
  memory_limit: 0,
  cpu_limit: 0,
  idle_timeout: 0,
  always_running: false,
  pay_as_you_go: null,
  gpu: false,
} as const;

// base quota + calculated default quotas is the quota object each project gets by default
// any additional quotas are added on top of it, up until the given limits
const BASE_QUOTAS: RQuota = {
  network: false,
  member_host: false,
  privileged: false, // for elevated docker privileges (FUSE mounting, later more)
  memory_request: 0, // will hold guaranteed RAM in MB
  cpu_request: 0, // will hold guaranteed min number of vCPUs as a float from 0 to infinity.
  disk_quota: DEFAULT_QUOTAS.disk_quota,
  memory_limit: DEFAULT_QUOTAS.memory, // upper bound on RAM in MB
  cpu_limit: DEFAULT_QUOTAS.cores, // upper bound on vCPUs
  idle_timeout: DEFAULT_QUOTAS.mintime, // minimum uptime
  always_running: false, // if true, a service restarts the project if it isn't running
  pay_as_you_go: null,
  gpu: false,
} as const;

// sanitize the overcommitment ratio or discard it
function sanitize_overcommit(oc: number | undefined): number | undefined {
  if (typeof oc == "number" && !isNaN(oc)) {
    return Math.max(1, oc);
  }
  return undefined;
}

// the quota calculation starts with certain base quotas, which could be modified by the site_settings
function calcDefaultQuotas(site_settings?: SiteSettingsQuotas): Quota {
  const quota: Quota = { ...BASE_QUOTAS };

  // overwrite/set extras for any set default quota in the site setting
  if (site_settings != null && site_settings.default_quotas != null) {
    const defaults = site_settings.default_quotas;

    if (typeof defaults.disk_quota == "number") {
      quota.disk_quota = defaults.disk_quota;
    }
    if (typeof defaults.internet == "boolean") {
      quota.network = defaults.internet;
    }
    if (typeof defaults.idle_timeout == "number") {
      quota.idle_timeout = defaults.idle_timeout as number;
    }
    if (typeof defaults.mem == "number") {
      quota.memory_limit = defaults.mem;
      const oc = sanitize_overcommit(defaults.mem_oc);
      // ratio is 1:mem_oc -- sanitize it first
      if (oc != null) {
        quota.memory_request = Math.round(defaults.mem / oc);
      }
    }
    if (typeof defaults.cpu == "number") {
      quota.cpu_limit = defaults.cpu as number;
      // ratio is 1:cpu_oc -- sanitize it first
      const oc = sanitize_overcommit(defaults.cpu_oc);
      if (oc != null) {
        quota.cpu_request = defaults.cpu / oc;
      }
    }
  }

  return quota;
}

// there is an old schema, inherited from SageMathCloud, etc. and newer iterations.
// this helps by going from one schema to the newer one
function upgrade2quota(up: Partial<Upgrades>): RQuota {
  const defaultFalse = (x) =>
    x != null ? (typeof x === "boolean" ? x : to_int(x) >= 1) : false;
  const defaultNumber = (x) =>
    x != null ? (typeof x === "number" ? x : to_float(x)) : 0;
  return {
    network: defaultFalse(up.network),
    member_host: defaultFalse(up.member_host),
    always_running: defaultFalse(up.always_running),
    disk_quota: defaultNumber(up.disk_quota),
    memory_limit: defaultNumber(up.memory),
    memory_request: defaultNumber(up.memory_request),
    cpu_limit: defaultNumber(up.cores),
    cpu_request: defaultNumber(up.cpu_shares) / 1024,
    privileged: defaultFalse(up.privileged),
    idle_timeout: defaultNumber(up.mintime),
    ext_rw: false,
    pay_as_you_go: null,
    patch: [],
    gpu: false,
  };
}

// operator for combining two quotas
function op_quotas(q1: RQuota, q2: RQuota, op: "min" | "max"): RQuota {
  const q: Quota = {};
  for (const [k, v] of Object.entries(ZERO_QUOTA)) {
    if (typeof v === "boolean") {
      q[k] = op === "min" ? q1[k] && q2[k] : q1[k] || q2[k];
    } else if (typeof v === "number") {
      const f = op === "min" ? Math.min : Math.max;
      q[k] = f(q1[k], q2[k]);
    }
  }
  return q as RQuota;
}

function min_quotas(q1: RQuota, q2: RQuota): RQuota {
  return op_quotas(q1, q2, "min");
}

function max_quotas(q1: RQuota, q2: RQuota): RQuota {
  return op_quotas(q1, q2, "max");
}

// we make sure no matter what, there are certain minimums being set
// still, max upgrades cap those hardcoded minimums
function ensure_minimum<T extends Quota | RQuota>(
  quota: T,
  max_upgrades?: RQuota,
): T {
  // ensure minimum cpu are met
  cap_lower_bound(quota, "cpu_request", MIN_POSSIBLE_CPU, max_upgrades);

  // ensure minimum memory request is met
  cap_lower_bound(quota, "memory_request", MIN_POSSIBLE_MEMORY, max_upgrades);

  // ensure minimum memory limit is met
  cap_lower_bound(quota, "memory_limit", MIN_MEMORY_LIMIT, max_upgrades);

  return quota;
}

// if we have some overcommit ratio set, increase a request after we know the quota
// important: the additional requests are capped by an eventually set max_upgrades!
function calc_oc(
  quota: RQuota,
  site_settings?: SiteSettingsQuotas,
  max_upgrades?: RQuota,
) {
  function ocfun(
    quota,
    ratio,
    limit: "cpu_limit" | "memory_limit",
    request: "memory_request" | "cpu_request",
  ): void {
    ratio = sanitize_overcommit(ratio);
    if (ratio != null) {
      const oc_val = quota[limit] / ratio;
      let val = Math.max(quota[request], oc_val);
      if (max_upgrades?.[request] != null) {
        val = Math.min(val, max_upgrades[request]);
      }
      quota[request] = val;
    }
  }

  if (site_settings?.default_quotas != null) {
    const { mem_oc, cpu_oc } = site_settings.default_quotas;
    if (quota.cpu_limit != null) {
      ocfun(quota, cpu_oc, "cpu_limit", "cpu_request");
    }
    if (quota.memory_limit != null) {
      ocfun(quota, mem_oc, "memory_limit", "memory_request");
    }
  }
  return quota;
}

// the earlier implementation somehow implicitly rounded down
function round_quota(quota: RQuota): RQuota {
  quota.memory_limit = Math.floor(quota.memory_limit);
  quota.memory_request = Math.floor(quota.memory_request);
  return quota;
}

interface OptsV2 {
  quota: Quota;
  max_upgrades: RQuota;
  site_settings?: SiteSettingsQuotas;
  settings: RQuota;
}

function quota_v2(opts: OptsV2): Quota {
  let quota = opts.quota as RQuota;
  const { settings, max_upgrades, site_settings = {} } = opts;
  // limit the default quota by max upgrades
  quota = min_quotas(quota, max_upgrades);

  // the "settings" object is the "admin upgrade", which isn't capped by the maximum.
  return ensure_minimum(
    round_quota(
      calc_oc(
        max_quotas(quota, settings),
        site_settings,
        max_upgrades,
      ),
    ),
    max_upgrades,
  );
}

// this is the main function – used by backend services to calculate the run quota of a given project
export function quota(
  settings_arg?: Settings,
  users_arg?: Users,
  site_settings?: SiteSettingsQuotas,
  pay_as_you_go?: {
    quota: PayAsYouGoQuota;
    account_id: string;
    purchase_id: number;
  },
): Quota {
  void users_arg;
  settings_arg = deep_copy(settings_arg);
  site_settings = deep_copy(site_settings);

  // empirically, this is sometimes a string -- we want this to be a number, though!
  if (typeof settings_arg?.disk_quota === "string") {
    settings_arg.disk_quota = to_int(settings_arg.disk_quota);
  }
  // we want to make sure the arguments can't be modified
  const settings: Readonly<Settings> = Object.freeze(
    settings_arg == null ? {} : settings_arg,
  );

  site_settings = Object.freeze(site_settings);

  // new quota object, we modify it in-place below and return it.
  let quota: Quota = calcDefaultQuotas(site_settings);

  // site settings max quotas overwrite the hardcoded values
  const max_upgrades: Upgrades = Object.freeze({
    ...MAX_UPGRADES,
    ...(site_settings?.max_upgrades ?? {}),
  });

  if (pay_as_you_go != null) {
    // Include pay-as-you-go quotas.  We just take
    // the maximum for each given quota, with the stupid
    // complication that the names and units are all
    // different.  pay_as_you_go is an array of objects
    // and the names and units they use are EXACTLY
    // the same as Settings, except some fields aren't used.
    quota = op_quotas(
      quota as RQuota,
      upgrade2quota(pay_as_you_go.quota),
      "max",
    );
  }

  let total_quota = quota_v2({
    quota,
    settings: upgrade2quota(settings),
    max_upgrades: upgrade2quota(max_upgrades),
    site_settings,
  });

  if (pay_as_you_go != null) {
    // do this after any other processing or it would just go away, e.g., when min'ing with max's
    total_quota.pay_as_you_go = pay_as_you_go;
  }

  return total_quota;
}

// TODO name is <K extends keyof Quota>, but that causes troubles ...
// at this point we already know that we only look for numeric properties and they're all != null
function cap_lower_bound(
  quota: Quota,
  name: keyof Quota,
  MIN_SPEC,
  max_upgrades?: RQuota,
): void {
  const val = quota[name];
  if (typeof val === "number") {
    let cap = quota.member_host ? MIN_SPEC.member : MIN_SPEC.nonmember;
    if (max_upgrades != null) {
      const max = max_upgrades[name];
      if (typeof max === "number") cap = Math.min(cap, max);
    }
    // @ts-ignore
    quota[name] = Math.max(val, cap);
  }
}

function make_number_parser(fn: Str2Num): NumParser {
  return (s: string | number | undefined): number => {
    if (s == null) return 0;
    try {
      const n = fn(s);
      if (isNaN(n)) {
        return 0;
      } else {
        return n;
      }
    } catch (error) {
      return 0;
    }
  };
}

const to_int: NumParser = make_number_parser(parseInt);

const to_float: NumParser = make_number_parser(parseFloat);

// used by frontend/settings/run quota, but it could also be used here (a TODO)
export function upgrade2quota_key(key: string): keyof Quota {
  switch (key) {
    case "mintime":
      return "idle_timeout";
    case "memory":
      return "memory_limit";
    case "cores":
      return "cpu_limit";
    case "cpu_shares":
      return "cpu_request";
  }
  return key as keyof Quota;
}

// inverse of the above
export function quota2upgrade_key(key: string): keyof Upgrades {
  switch (key) {
    case "idle_timeout":
      return "mintime";
    case "memory_limit":
      return "memory";
    case "cpu_limit":
      return "cores";
    case "cpu_request":
      return "cpu_shares";
  }
  return key as keyof Upgrades;
}

type Patch = { [key: string]: string | object }[];

export function loadPatch(val: string): Patch {
  try {
    const p = JSON.parse(val);
    if (test_valid_jsonpatch(p)) {
      return p;
    }
  } catch (err) {
    console.log(`loadPatch: ${err}`);
  }
  return [];
}
