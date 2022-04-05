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

import { DedicatedDisk, DedicatedVM } from "@cocalc/util/types/dedicated";
import { len } from "../misc";
import { VMS } from "@cocalc/util/upgrades/dedicated";
import { SiteLicenseQuota } from "../types/site-licenses";
import {
  LicenseIdleTimeouts,
  LicenseIdleTimeoutsKeysOrdered,
} from "../consts/site-license";
// TODO how to use the logger ?
//import { getLogger } from "@cocalc/backend/logger";
//const L = getLogger("upgrades:quota");

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
export interface Quota {
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
  dedicated_vm?: { machine: string } | boolean;
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

export interface Upgrades {
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

// all descriptions should be short sentences, expalining the user what's going on
export const LicenseStatusOptions = {
  valid: "License could provide upgrades.",
  active: "License provides upgrades.",
  expired: "No longer valid.",
  exhausted: "All seats are used up.",
  future: "Not yet valid.",
  ineffective: "Does not provide any additional upgrades.",
} as const;

export type LicenseStatus = keyof typeof LicenseStatusOptions;

export function isLicenseStatus(status?: unknown): status is LicenseStatus {
  if (typeof status !== "string") return false;
  return LicenseStatusOptions[status] != null;
}

export function licenseStatusProvidesUpgrades(status?: LicenseStatus) {
  if (status == null) return false;
  return status === "active" || status === "valid";
}

// it could be null in the moment when a license is removed via the UI
export type QuotaSetting =
  | ((Upgrades | SiteLicenseQuotaSetting | {}) & { status?: LicenseStatus })
  | null;

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

export function isSiteLicenseQuotaSetting(
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

/**
 * We imply/normalize some settings in order to make the remaining processing easier.
 */
function prepareSiteLicenses(site_licenses?: SiteLicenses): SiteLicenses {
  if (site_licenses == null || isEmpty(site_licenses)) return {};

  for (const sl of Object.values(site_licenses)) {
    if (!isSiteLicenseQuotaSetting(sl)) continue;
    const slq = sl.quota;
    const validIdleTimeouts = Object.keys(LicenseIdleTimeouts);
    if (slq.idle_timeout != null) {
      // reset idle_timeouts we don't know
      if (!validIdleTimeouts.includes(slq.idle_timeout)) {
        slq.idle_timeout = "short";
      }
      // every license with an idle_timeout gets member hosting – unless explicitly disabled (shouldn't be the case)
      if (slq.member !== false) slq.member = true;
    } else {
      // if there is no idle_timeout set, we default to "short"
      slq.idle_timeout = "short";
    }
  }

  return site_licenses;
}

// this is used below to map the various types of site license upgrades into unique groups
// key is <member:0/1>-<always_running:0/1>-<idle_timeout>
function makeSiteLicenseGroupKey(params: {
  always_running: "0" | "1";
  member_hosting: "0" | "1";
  idle_timeout: NonNullable<SiteLicenseQuota["idle_timeout"]>;
}): string {
  const { always_running: ar, member_hosting: mh, idle_timeout: it } = params;
  return `${ar}-${mh}-${it}`;
}

// return all possible key combinations,
// where the order is from highest to lowest priority
export function* siteLicenseSelectionKeys() {
  const ltkeys = LicenseIdleTimeoutsKeysOrdered.slice(0);
  // reversing a copy of ordered keys
  ltkeys.reverse();
  // one first, higher priority
  const oneZero = ["1", "0"] as const;
  // always running
  for (const ar of oneZero) {
    // member hosting
    for (const mh of oneZero) {
      for (const it of ltkeys) {
        const k = makeSiteLicenseGroupKey({
          always_running: ar,
          member_hosting: mh,
          idle_timeout: it,
        });
        yield k;
      }
    }
  }
}

export function licenseToGroupKey(val: QuotaSetting): string {
  const isAR = isSiteLicenseQuotaSetting(val)
    ? val.quota.always_running === true
    : ((val as Upgrades).always_running ?? 0) >= 1;

  const isMember = isSiteLicenseQuotaSetting(val)
    ? val.quota.member === true
    : ((val as Upgrades).member_host ?? 0) >= 1;

  // prepareSiteLicenses() takes care about always defining quota.idle_timeout (still, TS needs to know)
  const idle_timeout =
    (isSiteLicenseQuotaSetting(val) ? val.quota.idle_timeout : "short") ??
    "short";

  return makeSiteLicenseGroupKey({
    always_running: isAR ? "1" : "0",
    member_hosting: isMember ? "1" : "0",
    idle_timeout,
  });
}

// some site licenses do not mix.
// e.g. always_running==true can't upgrade another (especially large) one not having always_running set.
// also preempt upgrades shouldn't uprade member hosting upgades.
//
// this heuristic groups all licenses by always_running and member hosting, and then picks the first nonempty group.
// 2022-02: introducing a third dimension for "idle_timeout" license quota upgrades.
//
// Fall 2021: on top of that, "dedicted resources" are treated in a special way
// * VMs: do not mix with any other upgrades, only one per project
// * disks: orthogonal to VMs, more than one per project is possible
function selectMatchingLicenses(
  site_licenses: SiteLicenses,
  filterGroup?: string
):
  | {
      groupKey: string;
      selected: SiteLicenses;
    }
  | undefined {
  // if we filter by a group key, we're looking for matching boost licenses only!
  const type: "regular" | "boost" = filterGroup == null ? "regular" : "boost";

  // classification: each group is a list of licenses, and only the group
  // with the higest priority is considered for license upgrades.
  const groups: { [key: string]: string[] | null } = {};
  for (const [id, val] of Object.entries(site_licenses)) {
    if (val == null) continue;
    // skip boost upgrade licenses (all of them are with quota settings!) unless we're looking for boost upgrades
    if (
      isSiteLicenseQuotaSetting(val) &&
      (val.quota.boost ?? false) === (type === "regular")
    )
      continue;
    const groupKey = licenseToGroupKey(val);
    // in case we have a key to filter by, we skip those licenses with a different group key
    if (filterGroup != null && groupKey != filterGroup) continue;
    const curGrp = groups[groupKey];
    groups[groupKey] = curGrp == null ? [id] : [...curGrp, id];
  }

  // selection -- always_running comes first, then member hosting, ...
  function pickGroup() {
    for (const groupKey of siteLicenseSelectionKeys()) {
      const grp = groups[groupKey];
      if (grp != null && grp.length > 0) {
        const selected = grp.reduce((acc, cur) => {
          acc[cur] = site_licenses[cur];
          return acc;
        }, {});
        return { selected, groupKey };
      }
    }
  }

  return pickGroup();
}

function selectSiteLicenses(site_licenses: SiteLicenses): {
  site_licenses: SiteLicenses;
  dedicated_disks?: DedicatedDisk[];
  dedicated_vm?: DedicatedVM;
} {
  // this "extracts" all dedicated disk upgrades from the site_licenses map
  const dedicated_disks = select_dedicated_disks(site_licenses);
  // and here we extract the dedicated VM quota
  const dedicated_vm: DedicatedVM | null = select_dedicated_vm(site_licenses);
  // if there is a dedicated VM, we ignore all site licenses.
  if (dedicated_vm != null) {
    return { site_licenses: {}, dedicated_disks, dedicated_vm };
  }

  // will only return "regular" site licenses
  const regular = selectMatchingLicenses(site_licenses);
  const all = regular?.selected ?? {};
  if (regular != null) {
    const boosts = selectMatchingLicenses(site_licenses, regular.groupKey);
    // if boosts is not null, merge them into regular.site_licenses
    if (boosts != null) {
      Object.assign(all, boosts.selected);
    }
  }
  return { site_licenses: all, dedicated_disks };
}

// idle_timeouts aren't added up. All are assumed to have the *same* idle_timeout
// so we just take the first one. @see selectSiteLicense.
// the basic unit is seconds!
function calcSiteLicenseQuotaIdleTimeout(
  site_licenses?: SiteLicenseQuotaSetting[]
): number {
  if (site_licenses == null || site_licenses.length === 0) return 0;
  const sl = site_licenses[0];
  const it = sl.quota.idle_timeout;
  if (it == null) return 0;
  return LicenseIdleTimeouts[it].mins * 60;
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
    idle_timeout: 0, // idle_timeout is set AFTER summing up all licenses, they're not additive
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

  // those site licenses, which have a {quota : ...} set
  const site_license_quota_settings = Object.values(site_licenses).filter(
    isSiteLicenseQuotaSetting
  );

  // v2 of licenses, indirectly via {quota: {…}} objects, introducing yet another schema.
  const license_quota_sum = sum_quotas(
    ...site_license_quota_settings.map((l: SiteLicenseQuotaSetting) =>
      license2quota(l.quota)
    )
  );

  license_quota_sum.idle_timeout = calcSiteLicenseQuotaIdleTimeout(
    site_license_quota_settings
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
  let quota: Quota = calcDefaultQuotas(site_settings);

  // site settings max quotas overwrite the hardcoded values
  const max_upgrades: Upgrades = Object.freeze({
    ...MAX_UPGRADES,
    ...(site_settings?.max_upgrades ?? {}),
  });

  // site_licenses will at least be an empty dict object
  site_licenses = prepareSiteLicenses(site_licenses);

  // we might not consider all of them!
  const {
    site_licenses: site_licenses_selected,
    dedicated_disks = [],
    dedicated_vm = false,
  } = selectSiteLicenses(site_licenses);

  site_licenses = Object.freeze(site_licenses_selected);

  if (dedicated_vm !== false) {
    const vm = VMS[dedicated_vm.machine];
    const dedicated_quota: Partial<RQuota> = {
      network: true,
      member_host: true,
      always_running: true,
      memory_limit: 128 * 1000, //  fallback, hence this setting is very high!
      cpu_limit: 16, // fallback, hence this setting is very high!
      disk_quota: quota.disk_quota, // TODO: introduce disk quotas for VMs or use dedicated disks
      idle_timeout: quota.idle_timeout, // always_running is true, but it's sane to set this > 0
    };
    if (vm == null) {
      console.log(`no VM spec known for machine "${dedicated_vm.machine}"`);
    } else {
      if (vm.spec?.cpu != null) {
        dedicated_quota.cpu_limit = vm.spec?.cpu;
      }
      if (vm.spec?.mem != null) {
        dedicated_quota.memory_limit = 1000 * vm.spec?.mem;
      }
    }

    return {
      ...ZERO_QUOTA,
      ...dedicated_quota,
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
  const { site_licenses: site_licenses_selected, dedicated_vm = false } =
    selectSiteLicenses(site_licenses);
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

  // remember: this function is for the front-end
  // if there is a dedicated VM, all other licenses are ignored and we set some quotas
  // to avoid warnings and the red banner, that's all.
  if (dedicated_vm != null) {
    total_quota.dedicated_vm = dedicated_vm;
    total_quota.member_host = true;
    total_quota.network = true;
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
    if (["dedicated_disks", "dedicated_vm"].includes(key)) {
      // they are ignored
    } else if (typeof val === "boolean") {
      total_quota[key] &&= val;
    } else if (typeof val === "number") {
      total_quota[key] = Math.min(total_quota[key], val);
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
