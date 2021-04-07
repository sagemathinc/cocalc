/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Compute project quotas based on:

    - settings:
        - by admins
        - system-wide customizable site defaults
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
*/

// TODO: relative path just needed in manage-*

import { isEmpty } from "lodash";
import { DEFAULT_QUOTAS, upgrades } from "../upgrade-spec";
import { Quota as SiteLicenseQuota } from "../db-schema/site-licenses";
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

type NumParser = (s: string | undefined) => number;
type Str2Num = (s: string) => number;

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
}

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

interface SiteLicenseQuotaSetting {
  quota: SiteLicenseQuota;
}

type QuotaSetting = Upgrades | SiteLicenseQuotaSetting;

type SiteLicenses = {
  [license_id: string]: QuotaSetting;
};

/*
 * default quotas: {"internet":true,"mintime":3600,"mem":1000,"cpu":1,"cpu_oc":10,"mem_oc":5}
 * max_upgrades: Quota
 */
interface SiteSettingsQuotas {
  default_quotas: Partial<SiteSettingsDefaultQuotas>;
  max_upgrades: Partial<Upgrades>;
}

const ZERO_QUOTA: Required<Quota> = {
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
} as const;

// base quota + calculated default quotas is the quota object each project gets by default
// any additional quotas are added on top of it, up until the given limits
const BASE_QUOTAS: Required<Quota> = {
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
} as const;

// sanitize the overcommitment ratio or discard it
function sanitize_overcommit(oc: number | undefined): number | undefined {
  if (typeof oc == "number" && !isNaN(oc)) {
    return Math.max(1, oc);
  }
  return undefined;
}

// {"cfb75fa5-3dd8-4c8d-aa8f-0a91275019e5": {"quota": {"cpu": 1, "ram": 1, "disk": 1, "user": "academic", "member": true, "always_running": false}}}

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

// some site licenses do not mix.
// e.g. always running true can't upgrade another (especially large) one not having always running set.
// also preempt upgrades shouldn't uprade member hosting upgades.
//
// this heuristic groups all licenses by always_running and member hosting, and then picks the first nonempty group.
// TODO: once we have a license with an extended uptime (hours instead of ~30 mins), we introduce that as a third dimension.
function select_site_licenses(site_licenses?: SiteLicenses): SiteLicenses {
  if (site_licenses == null || isEmpty(site_licenses)) return {};

  // key is <member>-<always_running> as 0/1 numbers
  const groups = {
    "0-0": [],
    "0-1": [],
    "1-0": [],
    "1-1": [],
  };

  // classification
  for (const [key, val] of Object.entries(site_licenses)) {
    const is_ar = isSiteLicenseQuotaSetting(val)
      ? val.quota.always_running === true
      : (val.always_running ?? 0) >= 1;

    const is_member = isSiteLicenseQuotaSetting(val)
      ? val.quota.member === true
      : (val.member_host ?? 0) >= 1;

    groups[`${is_member ? "1" : "0"}-${is_ar ? "1" : "0"}`].push(key);
  }

  // selection -- always_running comes first, then member hosting
  const selected = (function () {
    for (const ar of ["1", "0"]) {
      for (const mh of ["1", "0"]) {
        const k = `${mh}-${ar}`;
        if (groups[k].length > 0) {
          return groups[k];
        }
      }
    }
  })();

  return selected.reduce((acc, cur) => {
    acc[cur] = site_licenses[cur];
    return acc;
  }, {});
}

// there is an old schema, inherited from SageMathCloud, etc. and newer iterations.
// this helps by going from one schema to the newer one
function upgrade2quota(up: Partial<Upgrades>): Required<Quota> {
  const dflt_false = (x) => (x != null ? x >= 1 : false);
  const dflt_num = (x) => (x != null ? x : 0);
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
  };
}

// this is summing up a list of quotas, where we assume they're all defined!
function sum_quotas(quotas: Required<Quota>[]): Required<Quota> {
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

function op_quotas(
  q1: Required<Quota>,
  q2: Required<Quota>,
  op: "min" | "max"
): Required<Quota> {
  const q: Quota = {};
  for (const [k, v] of Object.entries(ZERO_QUOTA)) {
    if (typeof v === "boolean") {
      q[k] = op === "min" ? q1[k] && q2[k] : q1[k] || q2[k];
    } else {
      const cmp = op === "min" ? Math.min : Math.max;
      q[k] = cmp(q1[k], q2[k]);
    }
  }
  return q as Required<Quota>;
}

//function min_quotas(q1: Required<Quota>, q2: Required<Quota>): Required<Quota> {
//  return op_quotas(q1, q2, "min");
//}

function max_quotas(q1: Required<Quota>, q2: Required<Quota>): Required<Quota> {
  return op_quotas(q1, q2, "max");
}

// this is inplace and also returns the modified quota
function ensure_minimum(quota): Quota {
  // ensure minimum cpu are met
  cap_lower_bound(quota, "cpu_request", MIN_POSSIBLE_CPU);

  // ensure minimum memory request is met
  cap_lower_bound(quota, "memory_request", MIN_POSSIBLE_MEMORY);

  // ensure minimum memory limit is met
  cap_lower_bound(quota, "memory_limit", MIN_MEMORY_LIMIT);

  return quota;
}

// if we have some overcommit ratio set, increase a request after we know the quota
function calc_oc({ quota, site_settings }) {
  if (site_settings?.default_quotas != null) {
    const { mem_oc, cpu_oc } = site_settings.default_quotas;
    if (quota.cpu_limit != null) {
      const oc = sanitize_overcommit(cpu_oc);
      if (oc != null) {
        const oc_cpu = quota.cpu_limit / oc;
        quota.cpu_request = Math.max(quota.cpu_request, oc_cpu);
      }
    }
    if (quota.memory_limit != null) {
      const oc = sanitize_overcommit(mem_oc);
      if (oc != null) {
        const oc_mem = Math.round(quota.memory_limit / oc);
        quota.memory_request = Math.max(quota.memory_request, oc_mem);
      }
    }
  }
}

function contribs_limited(
  default_quota: Quota,
  contribs: Quota,
  max_upgrades: Quota
): Required<Quota> {
  const ret: Quota = {};
  for (const [k, v] of Object.entries(ZERO_QUOTA)) {
    if (typeof v === "boolean") {
      ret[k] = max_upgrades[k] ? default_quota[k] || contribs[k] : false;
    } else {
      const limit = Math.max(0, max_upgrades[k] - default_quota[k]);
      ret[k] = Math.min(contribs[k], limit);
    }
  }
  return ret as Required<Quota>;
}

function calc_quota({
  quota,
  contribs,
  site_settings,
  max_upgrades,
}): Required<Quota> {
  const default_quota = { ...quota };
  if (false) calc_oc({ quota: contribs, site_settings });
  // limit the contributions by the overall maximum (except for the defaults!)
  const limited = contribs_limited(default_quota, contribs, max_upgrades);

  //console.log("default_quota", default_quota);
  //console.log("limited", limited);
  return limited;
}

function quota_v2(opts): Quota {
  let quota = opts.quota as Required<Quota>;
  const { settings, max_upgrades, users, site_licenses, site_settings } = opts;
  //console.log(quota, settings, max_upgrades, users, site_licenses);

  const users_sum = sum_quotas(
    Object.values(users)
      .filter((v: { upgrades?: Upgrades }) => v?.upgrades != null)
      .map((v: { upgrades: Upgrades }) => upgrade2quota(v.upgrades))
  );

  // v1 of licenses, encoding upgrades directly
  const licenses_sum = sum_quotas(
    Object.values(site_licenses).filter(isSettingsQuota).map(upgrade2quota)
  );

  console.log("settings", settings);
  quota = sum_quotas([
    max_quotas(quota, settings),
    calc_quota({
      quota,
      contribs: sum_quotas([users_sum, licenses_sum]),
      site_settings,
      max_upgrades,
    }),
  ]);
  console.log("sum_quotas", quota);

  //const total = ensure_minimum(
  //    min_quotas(
  //      upgrade2quota(max_upgrades),
  //      sum_quotas([quota, users_sum, licenses_sum])
  //    )
  //  )
  //);

  // const contribs = contribs_limit(
  //   quota,
  //   sum_quotas([users_sum, licenses_sum]),
  //   upgrade2quota(max_upgrades)
  // );
  //
  // calc_oc({ quota: sum_quotas([quota, contribs]), site_settings });

  //for (const [k, v] of Object.entries(ZERO_QUOTA)) {
  //  if (typeof v === "boolean") {
  //  } else {
  //  }
  //}

  const total = ensure_minimum(max_quotas(quota, settings));
  return total;
}

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
  const quota: Quota = calc_default_quotas(site_settings);

  // site settings max quotas overwrite the hardcoded values
  const max_upgrades: Upgrades = Object.freeze({
    ...MAX_UPGRADES,
    ...(site_settings?.max_upgrades ?? {}),
  });

  // we might not consider all of them!
  site_licenses = Object.freeze(select_site_licenses(site_licenses));

  if (process.env.v2) {
    return quota_v2({
      quota,
      settings: upgrade2quota(settings),
      max_upgrades: upgrade2quota(max_upgrades),
      users,
      site_licenses,
      site_settings,
    });
  }

  // network access
  if (max_upgrades.network == 0) {
    quota.network = false;
  } else if (!quota.network) {
    if (settings.network) {
      // free admin-set
      quota.network = true;
    } else {
      // paid by some user
      for (const userid in users) {
        const val = users[userid];
        if (val?.upgrades?.network) {
          quota.network = true;
          break;
        }
      }
      // or some site license
      if (!quota.network && site_licenses != null) {
        for (const license_id in site_licenses) {
          const val = site_licenses[license_id];
          if (isSettingsQuota(val) && val.network) {
            quota.network = true;
            break;
          }
        }
      }
    }
  }

  // member hosting, which translates to better hosting conditions of the project
  if (max_upgrades.member_host == 0) {
    quota.member_host = false;
  } else if (!quota.member_host) {
    if (settings.member_host) {
      // free admin-set
      quota.member_host = true;
    } else {
      // paid by some user
      for (const userid in users) {
        const val = users[userid];
        if (val?.upgrades?.member_host) {
          quota.member_host = true;
          break;
        }
      }
      // or some site license
      if (!quota.member_host && site_licenses != null) {
        for (const license_id in site_licenses) {
          const val = site_licenses[license_id];
          if (isSettingsQuota(val) && val.member_host) {
            quota.member_host = true;
            break;
          }
        }
      }
    }
  }

  // always_running – deal with it just like with member_hosting
  if (max_upgrades.always_running == 0) {
    quota.always_running = false;
  } else if (!quota.always_running) {
    if (settings.always_running) {
      // free admin-set
      quota.always_running = true;
    } else {
      // paid by some user
      for (const userid in users) {
        const val = users[userid];
        if (val?.upgrades?.always_running) {
          quota.always_running = true;
          break;
        }
      }
      // or some site license
      if (!quota.always_running && site_licenses != null) {
        for (const license_id in site_licenses) {
          const val = site_licenses[license_id];
          if (isSettingsQuota(val) && val.always_running) {
            quota.always_running = true;
            break;
          }
        }
      }
    }
  }

  // elevated quota for docker container (fuse mounting and maybe more ...).
  // This is only used for a few projects mainly by William Stein.
  // this is not available for general users.
  if (settings.privileged) {
    quota.privileged = true;
  }

  // Little helper to calculate the quotas, contributions, and limits.
  // name: of the computed quota, upgrade the quota config key,
  // parse_num for converting numbers, and factor for conversions
  // this takes license upgrades into account, but not the "site license" quotas
  function calc(
    name: string, // keyof Quota, but only the numeric ones
    upgrade: string, // keyof Settings, but only the numeric ones
    parse_num: NumParser,
    factor?: number
  ): void {
    if (factor == null) factor = 1;

    const default_quota = quota[name];

    let base: number;
    // there are no limits to settings "admin" upgrades
    if (settings[upgrade]) {
      base = factor * parse_num(settings[upgrade]);
    } else {
      base = Math.min(quota[name], factor * max_upgrades[upgrade]);
    }

    // contributions can come from user upgrades or site licenses
    let contribs = 0;
    for (const userid in users) {
      const val = users[userid];
      const num = val != null && val.upgrades && val.upgrades[upgrade];
      contribs += factor * parse_num(num);
    }
    if (site_licenses != null) {
      for (const license_id in site_licenses) {
        const val = site_licenses[license_id];
        const num = val != null && val[upgrade];
        contribs += factor * parse_num(num);
      }
    }
    // if we have some overcommit ratio set, increase a request
    if (site_settings?.default_quotas != null) {
      const { mem_oc, cpu_oc } = site_settings.default_quotas;
      if (name == "cpu_request" && quota.cpu_limit != null) {
        const oc = sanitize_overcommit(cpu_oc);
        if (oc != null) {
          const oc_cpu = quota.cpu_limit / oc;
          contribs = Math.max(contribs, oc_cpu - base);
        }
      } else if (name == "memory_request" && quota.memory_limit != null) {
        const oc = sanitize_overcommit(mem_oc);
        if (oc != null) {
          const oc_mem = Math.round(quota.memory_limit / oc);
          contribs = Math.max(contribs, oc_mem - base);
        }
      }
    }
    // limit the contributions by the overall maximum (except for the defaults!)
    const contribs_limit = Math.max(
      0,
      factor * max_upgrades[upgrade] - default_quota
    );
    contribs = Math.min(contribs, contribs_limit);

    // base is the default or the modified admin upgrades
    //console.log("calc", "name=" + name, base, contribs);
    quota[name] = base + contribs;
  }

  // disk space quota in MB
  calc("disk_quota", "disk_quota", to_int, undefined);

  // memory limit
  calc("memory_limit", "memory", to_int, undefined);

  // idle timeout: not used for setting up the project quotas, but necessary
  // to know for precise scheduling on nodes
  calc("idle_timeout", "mintime", to_int, undefined);

  // memory request -- must come AFTER memory_limit calculation
  calc("memory_request", "memory_request", to_int, undefined);

  // "cores" is the hard upper bound the project container should get
  calc("cpu_limit", "cores", to_float, undefined);

  // cpu_shares is the minimum cpu usage to request -- must come AFTER cpu_limit calculation
  calc("cpu_request", "cpu_shares", to_float, 1 / 1024);

  if (site_licenses != null) {
    // If there is new license.quota, compute it and max with it.
    const license_quota = site_license_quota(site_licenses, max_upgrades);
    max_quota(quota, license_quota);
  }

  // Finally apply all caps and also compute cpu_request in terms of cpu_shares.
  ensure_minimum(quota);

  return quota;
}

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
export function site_license_quota(
  site_licenses: SiteLicenses,
  max_upgrades_param?: Upgrades
): Quota {
  // we filter here as well, b/c this function is used elsewhere
  site_licenses = Object.freeze(select_site_licenses(site_licenses));
  // a fallback, should take site settings into account here as well
  const max_upgrades: Upgrades = max_upgrades_param ?? MAX_UPGRADES;

  // we start to define a "base" quota, easier to add up everything
  const total_quota: Required<Quota> = {
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

  // console.log("total_quota", JSON.stringify(total_quota, null, 2));

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

function limit_quota(
  total_quota: Required<Quota>,
  max_upgrades: Upgrades
): Quota {
  // console.log("total_quota", JSON.stringify(total_quota, null, 2));
  // console.log("max_upgrades", JSON.stringify(max_upgrades, null, 2));

  for (const [key, val] of Object.entries(upgrade2quota(max_upgrades))) {
    if (typeof val === "boolean") {
      total_quota[key] &&= val;
    } else {
      total_quota[key] = Math.min(total_quota[key], val);
    }
  }
  return total_quota;
}

// TODO name is <K extends keyof Quota>, but that causes troubles ...
// at this point we already know that we only look for numeric properties and they're all != null
function cap_lower_bound(quota: Quota, name: string, MIN_SPEC): void {
  const cap = quota.member_host ? MIN_SPEC.member : MIN_SPEC.nonmember;
  quota[name] = Math.max(quota[name], cap);
}

function make_number_parser(fn: Str2Num): NumParser {
  return (s: string | undefined): number => {
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
