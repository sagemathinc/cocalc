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
  nonmember: 0.02
});

// Min possible **guaranteed** RAM.
const MIN_POSSIBLE_MEMORY: Limit = Object.freeze({
  member: 300,
  nonmember: 200
});

// lower bound for the RAM "limit"
// in particular, we make sure member projects are above the free quota
const MIN_MEMORY_LIMIT: Limit = Object.freeze({
  member: 1.5 * DEFAULT_QUOTAS.memory,
  nonmember: DEFAULT_QUOTAS.memory
});

type NumParser = (s: string | undefined) => number;
type Str2Num = (s: string) => number;
type NumParserGen = (fn: Str2Num) => NumParser;

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
}

/*
 * default quotas: {"internet":true,"mintime":3600,"mem":1000,"cpu":1,"cpu_oc":10,"mem_oc":5}
 * max_upgrades: Quota
 */
interface SiteSettingsQuotas {
  default_quotas: { [key: string]: string | number };
  max_upgrades: Partial<Settings>;
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
  idle_timeout: DEFAULT_QUOTAS.mintime // minimum uptime
} as const;

function calc_default_quotas(site_settings?: SiteSettingsQuotas): Quota {
  const q: Quota = Object.assign({}, BASE_QUOTAS);

  // overwrite/set extras for any set default quota in the site setting
  if (site_settings != null) {
    const dq = site_settings?.default_quotas;
    if (typeof dq.internet == "boolean") q.network = dq.internet;
    if (typeof dq.idle_timeout == "number")
      q.idle_timeout = dq.idle_timeout as number;
    if (typeof dq.mem == "number") {
      q.memory_limit = dq.mem;
      if (typeof dq.mem_oc == "number")
        // ratio is 1:mem_oc
        q.memory_request = Math.round(dq.mem / dq.mem_oc);
    }
    if (typeof dq.cpu == "number") {
      q.cpu_limit = dq.cpu as number;
      if (typeof dq.cpu_oc == "number")
        // ratio is 1:cpu_oc
        q.cpu_request = Math.round((1024 * dq.cpu) / dq.cpu_oc);
    }
  }

  return q;
}

exports.quota = function(
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
  if (!quota.network) {
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

  // member hosting, which translates to "not pre-emptible"
  if (!quota.member_host) {
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
  const calc = function(
    name: string, // keyof Quota, but only the numeric ones
    upgrade: string, // keyof Settings, but only the numeric ones
    parse_num: NumParser,
    factor?: number
  ): void {
    if (factor == null) factor = 1;

    const base: number = (() => {
      // settings "overwrite" the default quotas
      if (settings[upgrade]) {
        quota[name] = factor * parse_num(settings[upgrade]);
        return Math.min(quota[name], factor * max_upgrades[upgrade]);
      } else {
        return quota[name];
      }
    })();
    // compute how much is left for contributed user upgrades
    const remain = Math.max(0, factor * max_upgrades[upgrade] - base);
    //console.log("calc", name, upgrade, "base", base, "remain", remain, "max_upgrades", max_upgrades[upgrade]);
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
    contribs = Math.min(remain, contribs);
    // use quota[name], and ignore base, because admins are allowed to contribute without limits
    quota[name] += contribs;
  };

  // disk space quota in MB
  calc("disk_quota", "disk_quota", to_int, undefined);

  // memory limit
  calc("memory_limit", "memory", to_int, undefined);

  // idle timeout: not used for setting up the project quotas, but necessary to know for precise scheduling on nodes
  calc("idle_timeout", "mintime", to_int, undefined);

  // memory request
  calc("memory_request", "memory_request", to_int, undefined);

  // "cores" is the hard upper bound the project container should get
  calc("cpu_limit", "cores", to_float, undefined);

  // cpu_shares is the minimum cpu usage to request
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
const cap_lower_bound = function(quota: Quota, name: string, MIN_SPEC) {
  const cap = quota.member_host ? MIN_SPEC.member : MIN_SPEC.nonmember;
  return (quota[name] = Math.max(quota[name], cap));
};

const make_number_parser: NumParserGen = function(fn: Str2Num) {
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
