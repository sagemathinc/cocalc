/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Compute project quotas based on:

    - settings:
        - by admins
        - system-wide customizable site defaults
        - overcommit ratios
        - maximum overall limits
    - old plans:
        - upgrades coming from about-to-be-deprecated subscriptions and course packages
    - site licenses:
        - old format which is the same as upgrades
        - new format quota object

The quota from coming from settings and user contributions and the
old site license formats all just add together.

The new format SiteLicenseQuota quota object just specifies precisely what the quotas should be
on the project using straightforward human units (with the new quotas all
adding together), rather than adding to some base built in default.  These
have to coexist for about a year.   The way they will combine is that we
first compute the total upgrades coming from everything but the SiteLicenseQuota.
We then compute the total upgrades defined by the SiteLicenseQuota (always
including network automatically, but capping them at whatever maxes we've defined).
Then final quota is the *max* of these two along each parameter.  Old and
new don't add, but of course multiple SiteLicenseQuota do add (since their
costs add).

2021-04-08: a messy "version 1" patchwork code was replaced by a cleaner implementation.
            see rev 19967bb82083b398 for the previous code.
*/

// TODO: relative path just needed in manage-*

import { isEmpty } from "lodash";
import { DEFAULT_QUOTAS, upgrades } from "../upgrade-spec";
import {
  Quota as SiteLicenseQuota,
  DedicatedDisk,
  DedicatedVM,
} from "../db-schema/site-licenses";
import { len } from "../misc";

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
const MIN_MEMORY_LIMIT: Limit = Object.freeze({
  member: 1.5 * DEFAULT_QUOTAS.memory,
  nonmember: DEFAULT_QUOTAS.memory,
});

type NumParser = (s: string | number | undefined) => number;
type Str2Num = (s: string | number) => number;

// the end result
interface Quota {
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
  dedicated_vm?: { machine: string } | false;
  dedicated_disks?: DedicatedDisk[];
}

type RQuota = Required<Quota>;

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

interface Upgrades {
  cores: number;
  cpu_shares: number; // 1024
  mintime: number;
  memory: number;
  memory_request: number;
  network: number;
  disk_quota: number;
  member_host: number;
  privileged: number;
  always_running: number;
  ephemeral_state: number;
  ephemeral_disk: number;
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

export interface SiteLicenseQuotaSetting {
  quota: SiteLicenseQuota;
}

// it could be null in the moment when a license is removed via the UI
export type QuotaSetting = Upgrades | SiteLicenseQuotaSetting | null;

export type SiteLicenses = {
  [license_id: string]: QuotaSetting;
};

/*
 * default quotas: {"internet":true,"mintime":3600,"mem":1000,"cpu":1,"cpu_oc":10,"mem_oc":5}
 * max_upgrades: Quota
 */
interface SiteSettingsQuotas {
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
  dedicated_vm: false,
  dedicated_disks: [] as DedicatedDisk[],
} as const;

// base quota + calculated default quotas is the quota object each project gets by default
// any additional quotas are added on top of it, up until the given limits
const BASE_QUOTAS: RQuota = {
  network: false,
  member_host: false,
  privileged: false, // for elevated docker privileges (FUSE mounting, later more)
  memory_request: 0, // will hold guaranteed RAM in MB
  cpu_request: 0, // will hold guaranteed min number of vCPU's as a float from 0 to infinity.
  disk_quota: DEFAULT_QUOTAS.disk_quota,
  memory_limit: DEFAULT_QUOTAS.memory, // upper bound on RAM in MB
  cpu_limit: DEFAULT_QUOTAS.cores, // upper bound on vCPU's
  idle_timeout: DEFAULT_QUOTAS.mintime, // minimum uptime
  always_running: false, // if true, a service restarts the project if it isn't running
  dedicated_vm: false,
  dedicated_disks: [] as DedicatedDisk[],
} as const;

// sanitize the overcommitment ratio or discard it
function sanitize_overcommit(oc: number | undefined): number | undefined {
  if (typeof oc == "number" && !isNaN(oc)) {
    return Math.max(1, oc);
  }
  return undefined;
}

// the quota calculation starts with certain base quotas, which could be modified by the site_settings
function calc_default_quotas(site_settings?: SiteSettingsQuotas): Quota {
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

function isSiteLicenseQuotaSetting(
  slq?: QuotaSetting
): slq is SiteLicenseQuotaSetting {
  return slq != null && (slq as SiteLicenseQuotaSetting).quota != null;
}

function isSettingsQuota(slq?: QuotaSetting): slq is Upgrades {
  if (slq == null || (slq as SiteLicenseQuotaSetting).quota != null)
    return false;
  return (
    (slq as Upgrades).disk_quota != null ||
    (slq as Upgrades).memory != null ||
    (slq as Upgrades).memory_request != null ||
    (slq as Upgrades).cores != null ||
    (slq as Upgrades).network != null ||
    (slq as Upgrades).cpu_shares != null ||
    (slq as Upgrades).mintime != null ||
    (slq as Upgrades).member_host != null ||
    (slq as Upgrades).ephemeral_state != null ||
    (slq as Upgrades).ephemeral_disk != null ||
    (slq as Upgrades).always_running != null
  );
}

function select_dedicated_vm(site_licenses: SiteLicenses): DedicatedVM | null {
  // if there is a dedicated_vm upgrade, pick the first one
  for (const val of Object.values(site_licenses)) {
    if (isSiteLicenseQuotaSetting(val) && val.quota.dedicated_vm != null) {
      const vm = val.quota.dedicated_vm;
      if (typeof vm !== "boolean" && typeof vm?.machine === "string") {
        return vm;
      }
    }
  }
  return null;
}

// extract all dedicated disks that are defined anywhere
function select_dedicated_disks(site_licenses: SiteLicenses): DedicatedDisk[] {
  const dedicated_disks: DedicatedDisk[] = [];
  for (const val of Object.values(site_licenses)) {
    if (isSiteLicenseQuotaSetting(val) && val.quota.dedicated_disk != null) {
      dedicated_disks.push(val.quota.dedicated_disk);
    }
  }
  return dedicated_disks;
}

// some site licenses do not mix.
// e.g. always_running==true can't upgrade another (especially large) one not having always_running set.
// also preempt upgrades shouldn't uprade member hosting upgades.
//
// this heuristic groups all licenses by always_running and member hosting, and then picks the first nonempty group.
// TODO: once we have a license with an extended uptime (hours instead of ~30 mins), we introduce that as a third dimension.
//
// Fall 2021: on top of that, "dedicted resources" are treated in a special way
// * VMs: do not mix with any other upgrades, only one per project
// * disks: orthogonal to VMs, more than one per project is possible
function select_site_licenses(site_licenses?: SiteLicenses): {
  site_licenses: SiteLicenses;
  dedicated_disks?: DedicatedDisk[];
  dedicated_vm?: DedicatedVM;
} {
  if (site_licenses == null || isEmpty(site_licenses))
    return { site_licenses: {} };

  // this "extracts" all dedicated disk upgrades from the site_licenses map
  const dedicated_disks = select_dedicated_disks(site_licenses);

  const dedicated_vm: DedicatedVM | null = select_dedicated_vm(site_licenses);

  if (dedicated_vm != null) {
    return { site_licenses: {}, dedicated_disks, dedicated_vm };
  }

  // key is <member>-<always_running> as 0/1 numbers
  const groups = {
    "0-0": [],
    "0-1": [],
    "1-0": [],
    "1-1": [],
  };

  // classification
  for (const [key, val] of Object.entries(site_licenses)) {
    if (val == null) continue;

    const is_ar = isSiteLicenseQuotaSetting(val)
      ? val.quota.always_running === true
      : (val.always_running ?? 0) >= 1;

    const is_member = isSiteLicenseQuotaSetting(val)
      ? val.quota.member === true
      : (val.member_host ?? 0) >= 1;

    groups[`${is_member ? "1" : "0"}-${is_ar ? "1" : "0"}`].push(key);
  }

  // selection -- always_running comes first, then member hosting
  const selected: string[] | null = (function () {
    for (const ar of ["1", "0"]) {
      // always running
      for (const mh of ["1", "0"]) {
        // member hosting
        const k = `${mh}-${ar}`;
        if (groups[k].length > 0) {
          return groups[k];
        }
      }
    }
  })();

  if (selected == null) return { site_licenses: {}, dedicated_disks };

  const selected_licenses = selected.reduce((acc, cur) => {
    acc[cur] = site_licenses[cur];
    return acc;
  }, {});

  return { site_licenses: selected_licenses, dedicated_disks };
}

// there is an old schema, inherited from SageMathCloud, etc. and newer iterations.
// this helps by going from one schema to the newer one
function upgrade2quota(up: Partial<Upgrades>): RQuota {
  const dflt_false = (x) =>
    x != null ? (typeof x === "boolean" ? x : to_int(x) >= 1) : false;
  const dflt_num = (x) =>
    x != null ? (typeof x === "number" ? x : to_float(x)) : 0;
  return {
    network: dflt_false(up.network),
    member_host: dflt_false(up.member_host),
    always_running: dflt_false(up.always_running),
    disk_quota: dflt_num(up.disk_quota),
    memory_limit: dflt_num(up.memory),
    memory_request: dflt_num(up.memory_request),
    cpu_limit: dflt_num(up.cores),
    cpu_request: dflt_num(up.cpu_shares) / 1024,
    privileged: dflt_false(up.privileged),
    idle_timeout: dflt_num(up.mintime),
    dedicated_vm: false, // old schema has no dedicated_vm upgrades
    dedicated_disks: [] as DedicatedDisk[], // old schema has no dedicated_disk upgrades
  };
}

// v2 license upgrades, converting to the quota schema
function license2quota(q: Partial<SiteLicenseQuota>): RQuota {
  return {
    network: true, // any license quota will give you network access
    member_host: !!q.member,
    always_running: !!q.always_running,
    disk_quota: 1000 * (q.disk ?? 0),
    memory_limit: 1000 * ((q.ram ?? 0) + (q.dedicated_ram ?? 0)),
    memory_request: 1000 * (q.dedicated_ram ?? 0),
    cpu_limit: (q.cpu ?? 0) + (q.dedicated_cpu ?? 0),
    cpu_request: q.dedicated_cpu ?? 0,
    privileged: false,
    idle_timeout: 0, // always zero, until we have an upgrade schema in place
    dedicated_vm: q.dedicated_vm ?? false,
    dedicated_disks: [] as DedicatedDisk[],
  };
}

// this is summing up several quotas, where we assume they're all fully defined!
function sum_quotas(...quotas: RQuota[]): RQuota {
  const sum = { ...ZERO_QUOTA };
  if (quotas == null || quotas.length == 0) return sum;

  for (const q of quotas) {
    for (const k in sum) {
      if (typeof sum[k] === "boolean") {
        sum[k] ||= q[k];
      } else {
        sum[k] += q[k];
      }
    }
  }
  return sum;
}

// operator for combining two quotas
function op_quotas(q1: RQuota, q2: RQuota, op: "min" | "max"): RQuota {
  const q: Quota = {};
  for (const [k, v] of Object.entries(ZERO_QUOTA)) {
    if (typeof v === "boolean") {
      q[k] = op === "min" ? q1[k] && q2[k] : q1[k] || q2[k];
    } else if (typeof v === "number") {
      const cmp = op === "min" ? Math.min : Math.max;
      q[k] = cmp(q1[k], q2[k]);
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
  max_upgrades?: RQuota
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
  max_upgrades?: RQuota
) {
  function ocfun(
    quota,
    ratio,
    limit: "cpu_limit" | "memory_limit",
    request: "memory_request" | "cpu_request"
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

// calculate how much users can contribute with their upgades
function calc_quota({ quota, contribs, max_upgrades }): RQuota {
  const default_quota: RQuota = { ...quota };

  // limit the contributions by the overall maximum (except for the defaults!)
  const limited: Quota = {};
  for (const [k, v] of Object.entries(ZERO_QUOTA)) {
    if (typeof v === "boolean") {
      limited[k] = max_upgrades[k] ? default_quota[k] || contribs[k] : false;
    } else {
      const limit = Math.max(0, max_upgrades[k] - default_quota[k]);
      limited[k] = Math.min(contribs[k], limit);
    }
  }
  // here we know all fields of the quota are defined
  return limited as RQuota;
}

interface OptsV2 {
  quota: Quota;
  max_upgrades: RQuota;
  users: Users;
  site_licenses?: SiteLicenses;
  site_settings?: SiteSettingsQuotas;
  settings: RQuota;
}

function quota_v2(opts: OptsV2): Quota {
  let quota = opts.quota as RQuota;
  const {
    settings,
    max_upgrades,
    users,
    site_licenses = {},
    site_settings = {},
  } = opts;
  // limit the default quota by max upgrades
  quota = min_quotas(quota, max_upgrades);

  // classical upgrades by users
  const users_sum = sum_quotas(
    ...Object.values(users)
      .filter((v: { upgrades?: Upgrades }) => v?.upgrades != null)
      .map((v: { upgrades: Upgrades }) => upgrade2quota(v.upgrades))
  );

  // v1 of licenses, encoding upgrades directly
  const license_upgrades_sum = sum_quotas(
    ...Object.values(site_licenses).filter(isSettingsQuota).map(upgrade2quota)
  );

  // v2 of licenses, indirectly via {quota: {…}} objects, introducing yet another schema.
  const license_quota_sum = sum_quotas(
    ...Object.values(site_licenses)
      .filter(isSiteLicenseQuotaSetting)
      .map((l: SiteLicenseQuotaSetting) => license2quota(l.quota))
  );

  // the main idea is old upgrades and licenses quotas only complement each other – not add up.
  // the "settings" object is the "admin upgrade", which isn't capped by the maximum.
  // calc_quota is limited by what's left up until the maximum. also, the previous implementation
  // did add up the deprecated license upgrades as if they were normal user upgrades.
  return ensure_minimum(
    round_quota(
      calc_oc(
        max_quotas(
          sum_quotas(
            max_quotas(quota, settings),
            calc_quota({
              quota,
              contribs: sum_quotas(users_sum, license_upgrades_sum),
              max_upgrades,
            })
          ),
          min_quotas(license_quota_sum, max_upgrades)
        ),
        site_settings,
        max_upgrades
      )
    ),
    max_upgrades
  );
}

// this is the main function – used by backend services to calculate the run quota of a given project
export function quota(
  settings_arg?: Settings,
  users_arg?: Users,
  site_licenses?: SiteLicenses,
  site_settings?: SiteSettingsQuotas
): Quota {
  // empirically, this is sometimes a string -- we want this to be a number, though!
  if (typeof settings_arg?.disk_quota === "string") {
    settings_arg.disk_quota = to_int(settings_arg.disk_quota);
  }
  // we want to make sure the arguments can't be modified
  const settings: Readonly<Settings> = Object.freeze(
    settings_arg == null ? {} : settings_arg
  );

  const users: Readonly<Users> = Object.freeze(
    users_arg == null ? {} : users_arg
  );

  site_settings = Object.freeze(site_settings);

  // new quota object, we modify it in-place below and return it.
  let quota: Quota = calc_default_quotas(site_settings);

  // site settings max quotas overwrite the hardcoded values
  const max_upgrades: Upgrades = Object.freeze({
    ...MAX_UPGRADES,
    ...(site_settings?.max_upgrades ?? {}),
  });

  // we might not consider all of them!
  const {
    site_licenses: site_licenses_selected,
    dedicated_disks = [],
    dedicated_vm = false,
  } = select_site_licenses(site_licenses);

  site_licenses = Object.freeze(site_licenses_selected);

  if (dedicated_vm !== false) {
    return {
      ...ZERO_QUOTA,
      dedicated_vm,
      dedicated_disks,
    };
  }

  const total_quota = quota_v2({
    quota,
    settings: upgrade2quota(settings),
    max_upgrades: upgrade2quota(max_upgrades),
    users,
    site_licenses,
    site_settings,
  });

  total_quota.dedicated_disks = dedicated_disks;
  return total_quota;
}

// this is used by webapp, not part of this quota calculation, and also not tested
export function max_quota(quota: Quota, license_quota: SiteLicenseQuota): void {
  for (const field in license_quota) {
    if (license_quota[field] == null) continue;
    if (typeof license_quota[field] == "boolean") {
      // boolean
      quota[field] = !!license_quota[field] || !!quota[field];
    } else {
      quota[field] = Math.max(license_quota[field] ?? 0, quota[field] ?? 0);
    }
  }
}

// Compute the contribution to quota coming from the quota field of the site licenses.
// This is max'd with the quota computed using settings, the rest of the licenses, etc.
// The given licenses might be a subset of all, because e.g. it's sort of cheating
// to combine memory upgades of member hosting with preempt hosting, or add a small
// always_running license on top of a cheaper but larger member hosting license.
// @see select_site_licenses
//
// this is only used by webapp, not this quota function, and also not tested
export function site_license_quota(
  site_licenses: SiteLicenses,
  max_upgrades_param?: Upgrades
): Quota {
  // we filter here as well, b/c this function is used elsewhere
  const { site_licenses: site_licenses_selected } =
    select_site_licenses(site_licenses);
  site_licenses = Object.freeze(site_licenses_selected);
  // a fallback, should take site settings into account here as well
  const max_upgrades: Upgrades = max_upgrades_param ?? MAX_UPGRADES;

  // we start to define a "base" quota, easier to add up everything
  const total_quota: RQuota = {
    cpu_limit: 0,
    cpu_request: 0,
    memory_limit: 0,
    memory_request: 0,
    disk_quota: 0,
    always_running: false,
    network: false,
    member_host: false,
    privileged: false,
    idle_timeout: 0,
    dedicated_vm: false,
    dedicated_disks: [],
  };

  for (const license of Object.values(site_licenses)) {
    if (!isSiteLicenseQuotaSetting(license)) continue;
    const quota: SiteLicenseQuota | undefined = license.quota;
    if (quota == null || len(quota) == 0) continue;

    // If there is any nontrivial new quota contribution, then
    // project automatically gets network access... we trust it.
    total_quota.network = true;

    if (quota.always_running) {
      total_quota.always_running ||= quota.always_running;
    }
    if (quota.member) {
      total_quota.member_host ||= quota.member;
    }
    if (quota.cpu) {
      total_quota.cpu_limit += quota.cpu;
    }
    if (quota.ram) {
      total_quota.memory_limit += 1000 * quota.ram;
    }
    if (quota.dedicated_cpu) {
      total_quota.cpu_request += quota.dedicated_cpu;
      // dedicated CPU also contributes to the shared cpu limit:
      total_quota.cpu_limit += quota.dedicated_cpu;
    }
    if (quota.dedicated_ram) {
      total_quota.memory_request += 1000 * quota.dedicated_ram;
      // The dedicated RAM **also** contributes "for free" to the shared RAM
      // which is an upper bound.
      total_quota.memory_limit += 1000 * quota.dedicated_ram;
    }
    if (quota.disk) {
      total_quota.disk_quota += 1000 * quota.disk;
    }
  }

  const ret = limit_quota(total_quota, max_upgrades);
  //console.log("total_quota_limited", JSON.stringify(ret, null, 2));
  return ret;
}

/*
for better understanding of the next two functions, here are two examples

total_quota =  {            max_upgrades = {
  cpu_limit: 3,               disk_quota: 20000,
  cpu_request: 1,             memory: 16000,
  memory_limit: 3000,         memory_request: 8000,
  memory_request: 1000,       cores: 3,
  disk_quota: 2000,           network: 1,
  always_running: true,       cpu_shares: 2048,
  network: true,              mintime: 7776000,
  member_host: true,          member_host: 1,
  privileged: false,          ephemeral_state: 1,
  idle_timeout: 0             ephemeral_disk: 1,
}                             always_running: 1
                            }
*/

function limit_quota(total_quota: RQuota, max_upgrades: Upgrades): Quota {
  for (const [key, val] of Object.entries(upgrade2quota(max_upgrades))) {
    if (typeof val === "boolean") {
      total_quota[key] &&= val;
    } else if (typeof val === "number") {
      total_quota[key] = Math.min(total_quota[key], val);
    } else if (["dedicated_disks", "dedicated_vm"].includes(key)) {
      // they are ignored
    } else {
      throw Error(`unhandled key ${key}`);
    }
  }
  return total_quota;
}

// TODO name is <K extends keyof Quota>, but that causes troubles ...
// at this point we already know that we only look for numeric properties and they're all != null
function cap_lower_bound(
  quota: Quota,
  name: keyof Quota,
  MIN_SPEC,
  max_upgrades?: RQuota
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
