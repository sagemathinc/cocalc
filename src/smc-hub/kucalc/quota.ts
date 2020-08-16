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

import { DEFAULT_QUOTAS, upgrades } from "../../smc-util/upgrade-spec";
import { Quota as SiteLicenseQuota } from "../../smc-util/db-schema/site-licenses";
import { len } from "../../smc-util/misc";

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

interface Users {
  [userid: string]: {
    upgrades?: Quota;
  };
}

interface Settings {
  network?: boolean;
  member_host?: boolean;
  disk_quota?: string;
  memory_limit?: string;
  memory_request?: string;
  privileged?: boolean;
  idle_timeout?: number;
  cpu_shares?: string;
  always_running?: number;
  quota?: SiteLicenseQuota;
}

interface Upgrades {
  disk_quota: number;
  memory: number;
  memory_request: number;
  cores: number;
  network: number;
  cpu_shares: number;
  mintime: number;
  member_host: number;
  ephemeral_state: number;
  ephemeral_disk: number;
  always_running: number;
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
interface SiteSettingsQuotas {
  default_quotas: Partial<SiteSettingsDefaultQuotas>;
  max_upgrades: Partial<Upgrades>;
}

// base quota + calculated default quotas is the quota object each project gets by default
// any additional quotas are added on top of it, up until the given limits
const BASE_QUOTAS: Quota = {
  network: false,
  member_host: false,
  memory_request: 0, // will hold guaranteed RAM in MB
  cpu_request: 0, // will hold guaranteed min number of vCPU's as a float from 0 to infinity.
  privileged: false, // for elevated docker privileges (FUSE mounting, later more)
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
  const quota: Quota = Object.assign({}, BASE_QUOTAS);

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

export function quota(
  settings_arg?: Settings,
  users_arg?: Users,
  site_license?: { [license_id: string]: Settings },
  site_settings?: SiteSettingsQuotas
): Quota {
  // we want settings and users to be defined below and make sure the
  // arguments can't be modified
  const settings: Readonly<Settings> = Object.freeze(
    settings_arg == null ? {} : settings_arg
  );

  const users: Readonly<Users> = Object.freeze(
    users_arg == null ? {} : users_arg
  );

  // new quota object, we modify it in-place below and return it.
  const quota: Quota = calc_default_quotas(site_settings);

  // site settings max quotas overwrite the hardcoded values
  const max_upgrades = Object.assign(
    {},
    MAX_UPGRADES,
    site_settings?.max_upgrades ?? {}
  );

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
        if (val != null && val.upgrades && val.upgrades.network) {
          quota.network = true;
          break;
        }
      }
      // or some site license
      if (!quota.network && site_license != null) {
        for (const license_id in site_license) {
          const val = site_license[license_id];
          if (val != null && val.network) {
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
        if (val != null && val.upgrades && val.upgrades.member_host) {
          quota.member_host = true;
          break;
        }
      }
      // or some site license
      if (!quota.member_host && site_license != null) {
        for (const license_id in site_license) {
          const val = site_license[license_id];
          if (val != null && val.member_host) {
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
        if (val != null && val.upgrades && val.upgrades.always_running) {
          quota.always_running = true;
          break;
        }
      }
      // or some site license
      if (!quota.always_running && site_license != null) {
        for (const license_id in site_license) {
          const val = site_license[license_id];
          if (val != null && val.always_running) {
            quota.always_running = true;
            break;
          }
        }
      }
    }
  }

  // elevated quota for docker container (fuse mounting and maybe more ...).
  // This is only used for a few projects mainly by William Stein.
  if (settings.privileged) {
    quota.privileged = true;
  }

  // user-upgrades are disabled on purpose (security concerns and not implemented)!
  //else
  //    for _, val of users
  //        if val?.upgrades?.privileged
  //            quota.privileged = true
  //            break

  // Little helper to calculate the quotas, contributions, and limits.
  // name: of the computed quota, upgrade the quota config key,
  // parse_num for converting numbers, and factor for conversions
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
    if (site_license != null) {
      for (const license_id in site_license) {
        const val = site_license[license_id];
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

  // ensure minimum cpu are met
  cap_lower_bound(quota, "cpu_request", MIN_POSSIBLE_CPU);

  // ensure minimum memory request is met
  cap_lower_bound(quota, "memory_request", MIN_POSSIBLE_MEMORY);

  // ensure minimum memory limit is met
  cap_lower_bound(quota, "memory_limit", MIN_MEMORY_LIMIT);

  if (site_license != null) {
    // If there is new license.quota, compute it and max with it.
    const license_quota = site_license_quota(site_license);
    for (const field in license_quota) {
      if (typeof license_quota[field] == "number") {
        quota[field] = Math.max(license_quota[field], quota[field] ?? 0);
      } else {
        // boolean
        quota[field] = !!license_quota[field] || !!quota[field];
      }
    }
  }

  return quota;
}

// Compute the contribution to quota coming from the quota field of the site licenses.
// This is max'd with the quota computed using settings, the rest of the licenses, etc.
function site_license_quota(site_license: {
  [license_id: string]: Settings;
}): SiteLicenseQuota {
  const total_quota: Quota = {};
  for (const license_id in site_license) {
    const license = site_license[license_id];
    if (license == null) continue;
    const { quota } = license;
    if (quota == null || len(quota) == 0) continue;
    // If there is any nontrivial new quota contribution, then
    // project automatically gets network access... we trust it.
    total_quota.network = true;
    if (quota.member) {
      total_quota.member_host = true;
    }
    if (quota.always_running) {
      total_quota.always_running = true;
    }
    if (quota.cpu) {
      total_quota.cpu_limit = (total_quota.cpu_limit ?? 0) + quota.cpu;
    }
    if (quota.ram) {
      total_quota.memory_limit =
        (total_quota.memory_limit ?? 0) + 1000 * quota.ram;
    }
    if (quota.disk) {
      total_quota.disk_quota =
        (total_quota.disk_quota ?? 0) + 1000 ** quota.disk;
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
