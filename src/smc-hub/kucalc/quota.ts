/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// computing project quotas based on settings (by admin/system) and user contributions ("upgrades")

// historical note:
// previously there was a "hardcoded" cpu_shares value in the setting, which was stored in the DB.
// we no longer have that in kucalc, but the values were still there.
// this quota code subtracted 256 unconditionally from that value to compensate for this.
// in December 2018, we removed almost all cpu_shares from the DB (LIMIT 1000 to avoid locking the db too long)

/*
WITH s256 AS (
    SELECT project_id
    FROM projects
    WHERE (settings ->> 'cpu_shares')::float BETWEEN 1 AND 256
    ORDER BY created ASC
    LIMIT 1000
)
UPDATE projects AS p
SET    settings = jsonb_set(settings, '{cpu_shares}', '0')
FROM   s256
WHERE  p.project_id = s256.project_id
RETURNING p.project_id;
*/

const { DEFAULT_QUOTAS } = require("smc-util/upgrade-spec");
const MAX_UPGRADES = require("smc-util/upgrade-spec").upgrades.max_per_project;

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
type NumParserGen = (fn: Str2Num) => NumParser;

// the end result
interface Quota {
  network?: boolean;
  member_host?: boolean;
  disk_quota?: number;
  memory_limit?: number;
  memory_request?: number;
  cpu_limit?: number;
  cpu_request?: number;
  privileged?: boolean;
  idle_timeout?: number;
  always_running?: boolean;
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
function sani_oc(oc: number | undefined): number | undefined {
  if (typeof oc == "number" && !isNaN(oc)) {
    return Math.max(1, oc);
  }
  return undefined;
}

function calc_default_quotas(site_settings?: SiteSettingsQuotas): Quota {
  const q: Quota = Object.assign({}, BASE_QUOTAS);

  // overwrite/set extras for any set default quota in the site setting
  if (site_settings != null && site_settings.default_quotas != null) {
    const dq = site_settings.default_quotas;

    if (typeof dq.disk_quota == "number") {
      q.disk_quota = dq.disk_quota;
    }
    if (typeof dq.internet == "boolean") {
      q.network = dq.internet;
    }
    if (typeof dq.idle_timeout == "number") {
      q.idle_timeout = dq.idle_timeout as number;
    }
    if (typeof dq.mem == "number") {
      q.memory_limit = dq.mem;
      const oc = sani_oc(dq.mem_oc);
      // ratio is 1:mem_oc -- sanitize it first
      if (oc != null) {
        q.memory_request = Math.round(dq.mem / oc);
      }
    }
    if (typeof dq.cpu == "number") {
      q.cpu_limit = dq.cpu as number;
      // ratio is 1:cpu_oc -- sanitize it first
      const oc = sani_oc(dq.cpu_oc);
      if (oc != null) {
        q.cpu_request = dq.cpu / oc;
      }
    }
  }

  return q;
}

exports.quota = function (
  settings_arg?: Settings,
  users_arg?: Users,
  site_license?: { [license_id: string]: Settings },
  site_settings?: SiteSettingsQuotas
) {
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
  const calc = function (
    name: string, // keyof Quota, but only the numeric ones
    upgrade: string, // keyof Settings, but only the numeric ones
    parse_num: NumParser,
    factor?: number
  ): void {
    if (factor == null) factor = 1;

    const dflt_quota = quota[name];

    const base: number = ((): number => {
      // there are no limits to settings "admin" upgrades
      if (settings[upgrade]) {
        return factor * parse_num(settings[upgrade]);
      } else {
        return Math.min(quota[name], factor * max_upgrades[upgrade]);
      }
    })();

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
        const oc = sani_oc(cpu_oc);
        if (oc != null) {
          const oc_cpu = quota.cpu_limit / oc;
          contribs = Math.max(contribs, oc_cpu - base);
        }
      } else if (name == "memory_request" && quota.memory_limit != null) {
        const oc = sani_oc(mem_oc);
        if (oc != null) {
          const oc_mem = Math.round(quota.memory_limit / oc);
          contribs = Math.max(contribs, oc_mem - base);
        }
      }
    }
    // limit the contributions by the overall maximum (except for the defaults!)
    const contribs_limit = Math.max(
      0,
      factor * max_upgrades[upgrade] - dflt_quota
    );
    contribs = Math.min(contribs, contribs_limit);
    // base is the default or the modified admin upgrades
    quota[name] = base + contribs;
  };

  // disk space quota in MB
  calc("disk_quota", "disk_quota", to_int, undefined);

  // memory limit
  calc("memory_limit", "memory", to_int, undefined);

  // idle timeout: not used for setting up the project quotas, but necessary to know for precise scheduling on nodes
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

  return quota;
};

// TODO name is <K extends keyof Quota>, but that causes troubles ...
// at this point we already know that we only look for numeric properties and they're all != null
const cap_lower_bound = function (quota: Quota, name: string, MIN_SPEC) {
  const cap = quota.member_host ? MIN_SPEC.member : MIN_SPEC.nonmember;
  return (quota[name] = Math.max(quota[name], cap));
};

const make_number_parser: NumParserGen = function (fn: Str2Num) {
  return (s: string | undefined) => {
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
};

const to_int: NumParser = make_number_parser(parseInt);

const to_float: NumParser = make_number_parser(parseFloat);
