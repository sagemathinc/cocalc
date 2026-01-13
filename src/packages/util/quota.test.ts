/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
this tests kucalc's quota function

after any change to quota.ts, be a good citizen and run this test and
extend it to test whatever you changed too.  In one terminal:

.../packages/util$ npm run tsc

and in another:

.../packages/util$ ../node_modules/.bin/jest dist/quota.test.js  [--watch]


Also generally do this:

.../packages/util$ npm test

*/

import expect from "expect";

// TODO: this hack to make quota of type any is hiding a bug
// in our testing below.  Replace by the following to see the
// dozens of type errors.  This is definitely something to be
// properly fixed, not a bug in testing.
// import { quota } from "./upgrades/quota";
import {
  quota as quota0,
  quota_with_reasons,
  quota_with_reasons as reasons0,
} from "./upgrades/quota";
const quota = quota0 as (a?, b?, c?, d?, e?) => ReturnType<typeof quota0>;
const reasons = reasons0 as (a?, b?, c?, d?) => ReturnType<typeof reasons0>;

import { isBoostLicense } from "./upgrades/utils";

import { LicenseIdleTimeoutsKeysOrdered } from "./consts/site-license";
import { deep_copy } from "./misc";
import {
  SiteLicenseQuota,
  SiteLicenses,
} from "./types/site-licenses";

const DISK_QUOTA = 1000;

export type SiteLicenseQuotas = { [uuid: string]: { quota: SiteLicenseQuota } };

describe("main quota functionality", () => {
  it("basics are fine", () => {
    // quota should work without any arguments
    const basic = quota();
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.02,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: false,
      memory_limit: 1000,
      memory_request: 200,
      network: false,
      privileged: false,
      gpu: false,
      always_running: false,
    };
    expect(basic).toEqual(exp);
  });

  it("respects admin member/network upgrades", () => {
    const admin1 = quota({ member_host: 1, network: 1 }, {});
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.05, // set at the top of quota config
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true, // what this upgrade is about
      memory_limit: 1000, // set at the top of quota config
      memory_request: 300, // set at the top of quota config
      network: true, // what this upgrade is about
      privileged: false,
      gpu: false,
      always_running: false,
    };
    expect(admin1).toEqual(exp);
  });

  it("do NOT set limits >= requests -- manage pod in kucalc does that", () => {
    const settings = {
      member_host: 1,
      network: 1,
      memory_request: 3210,
    };

    const exp = {
      network: true,
      member_host: true,
      memory_request: 3210,
      memory_limit: 1000, // 1000 mb free for members
      cpu_request: 0.05,
      cpu_limit: 1,
      privileged: false,
      gpu: false,
      idle_timeout: 1800, // 1800 secs free
      disk_quota: DISK_QUOTA,
      always_running: false,
    };
    expect(quota(settings)).toEqual(exp);
  });

  it("does not limit admin upgrades", () => {
    const settings = {
      network: 2,
      member_host: 3,
      disk_quota: 32000, // max 20gb
      memory: 20000, // max 16gb
      mintime: 24 * 3600 * 100, // max 90 days
      memory_request: 10000, // max 8gb
      cores: 7, // max 4 shared
      cpu_shares: 1024 * 4, // max 3 requests
    };

    const maxedout = quota(settings, {});
    const exp = {
      cpu_limit: 7, // > limit
      cpu_request: 4, // > limit
      disk_quota: 32000, // > limit
      idle_timeout: 24 * 3600 * 100, // > limit
      member_host: true,
      memory_limit: 20000, // > limit
      memory_request: 10000, // > limit
      network: true,
      privileged: false,
      gpu: false,
      always_running: false,
    };
    expect(maxedout).toEqual(exp);
  });

  it("sanitizes admin upgrades", () => {
    const settings = {
      memory: "5000", // some are strings
      disk_quota: "3210", // we do know this could be a strings
      mintime: "3600",
      network: "1",
      cores: "1.5",
      member_host: "1",
      always_running: "0",
      memory_request: "512",
    };
    expect(quota(settings)).toEqual({
      always_running: false,
      cpu_limit: 1.5,
      cpu_request: 0.05, // due to member hosting minimum
      disk_quota: 3210,
      idle_timeout: 3600,
      member_host: true,
      memory_limit: 5000,
      memory_request: 512,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("allows privileged updates for admins", () => {
    const settings = { privileged: 1 };
    const q = quota(settings, {});
    expect(q.privileged).toBe(true);
  });

  it("caps ensures a minimum lower limit for ceratin quotas", () => {
    const settings = {
      cpu_request: 0,
      memory_request: 0,
      memory_limit: 0,
    };
    const q = quota(settings);
    expect(q.cpu_request).toBeGreaterThan(0.01);
    expect(q.memory_request).toBeGreaterThan(100);
    expect(q.memory_limit).toBeGreaterThan(100);
  });

  it("caps depending on free vs. member", () => {
    const qfree = quota();
    const qmember = quota({ member_host: 1 });

    // checking two of them explicitly
    expect(qfree.cpu_request).toBe(0.02);
    expect(qmember.cpu_request).toBe(0.05);

    // members get strictly more than free users
    expect(qfree.cpu_request).toBeDefined();
    expect(qfree.memory_request).toBeDefined();
    expect(qfree.memory_limit).toBeDefined();

    expect(qfree.cpu_request).toBeLessThan(qmember.cpu_request as number);
    expect(qfree.memory_request).toBeLessThan(qmember.memory_request as number);
    expect(qfree.memory_limit).toBeLessThanOrEqual(
      qmember.memory_limit as number,
    );
  });

  it("partial site_settings1/mem", () => {
    const site_settings = {
      default_quotas: { internet: true, idle_timeout: 3600, mem_oc: 5 },
    };
    const settings = { member_host: 1, memory: 4100 };
    const q = quota(settings, undefined, undefined, site_settings);
    expect(q).toEqual({
      idle_timeout: 3600,
      memory_limit: 4100,
      memory_request: 820, // 4100 / 5
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      member_host: true,
      network: true,
      privileged: false,
      gpu: false,
      always_running: false,
    });
  });

  it("partial site_settings2/cpu", () => {
    const site_settings = {
      default_quotas: {
        idle_timeout: 9999,
        cpu_oc: 10,
        mem_oc: 2,
        disk_quota: 5432,
      },
    };
    const settings = { network: 1, cores: 1.4 };
    const q = quota(settings, undefined, undefined, site_settings);
    expect(q).toEqual({
      idle_timeout: 9999,
      memory_limit: 1000,
      memory_request: 500,
      cpu_limit: 1.4,
      cpu_request: 1.4 / 10,
      disk_quota: 5432,
      member_host: false,
      network: true,
      privileged: false,
      gpu: false,
      always_running: false,
    });
  });

  it("defaults capped by lower max_upgrades", () => {
    const site_settings = {
      max_upgrades: {
        member_host: false,
        network: false,
        disk_quota: 333,
        mintime: 999,
        cpu_shares: 64,
        cores: 0.44,
        memory_request: 1,
        memory_limit: 555,
      },
    };

    const q1 = quota({}, undefined, undefined, site_settings);
    expect(q1).toEqual({
      network: false,
      member_host: false,
      privileged: false,
      gpu: false,
      memory_request: 1, // below minimum cap, because max_upgrades in settings are stronger than hardcoded vals
      cpu_request: 0.02,
      disk_quota: 333,
      memory_limit: 1000,
      cpu_limit: 0.44, // below minimum cap, because max_upgrades in settings are stronger than hardcoded vals
      idle_timeout: 999,
      always_running: false,
    });
  });

  it("site_settings default_quotas and max_upgrades/1", () => {
    const site_settings = {
      default_quotas: {
        internet: true,
        idle_timeout: 9999,
        mem: 1515,
        cpu: 1.6,
        cpu_oc: 4,
        mem_oc: 5,
      },
      max_upgrades: {
        disk_quota: 512,
        mintime: 3600,
        cpu_shares: 1024 / 10,
        memory_request: 1000,
      },
    };

    // capped hardcoded default by max_upgrades
    const q1 = quota({}, { userX: {} }, undefined, site_settings);
    expect(q1).toEqual({
      network: true,
      member_host: false,
      memory_request: 303, // OC 1:5 of 1515mb
      memory_limit: 1515, // default
      cpu_request: 0.1, // OC 1:4 and cpu 1.6 → 0.4, but cpu_shares .1!
      cpu_limit: 1.6, // default
      privileged: false,
      gpu: false,
      idle_timeout: 3600, // capped by max_upgrades
      disk_quota: 512,
      always_running: false,
    });
  });

  it("site_settings default_quotas and max_upgrades/2", () => {
    const site_settings = {
      default_quotas: {
        internet: true,
        cpu: 1,
        cpu_oc: 5,
      },
      max_upgrades: {
        cpu_request: 0.1,
        cores: 0.5,
        cpu_shares: 1024 / 10,
      }, // .1 core
    };

    const q1 = quota({}, { userX: {} }, undefined, site_settings);
    expect(q1).toEqual({
      network: true,
      member_host: false,
      memory_request: 200, // non-member minimum
      memory_limit: 1000,
      cpu_request: 0.1, // max upgrade
      cpu_limit: 0.5, // cores max_upgrades
      privileged: false,
      gpu: false,
      idle_timeout: 1800,
      disk_quota: DISK_QUOTA,
      always_running: false,
    });
  });

  it("site_settings default_quotas and max_upgrades/3", () => {
    const site_settings = {
      default_quotas: {
        internet: true,
        idle_timeout: 9999,
        mem: 2000,
        mem_oc: 2,
        cpu: 2.2,
        cpu_oc: 4,
      },
      max_upgrades: {
        disk_quota: 512,
        mintime: 3600,
        cpu_shares: 1024, // 1 core limit
        cores: 2,
        memory_request: 500,
      },
    };

    const q1 = quota({}, { userX: {} }, undefined, site_settings);
    expect(q1).toEqual({
      network: true,
      member_host: false,
      memory_request: 500, // OC 1:2 of 2000mb
      memory_limit: 2000, // default
      cpu_request: 0.55, // OC 1:4 of 2.2, not at maximum
      cpu_limit: 2, // default limited by max_upgrades
      privileged: false,
      gpu: false,
      idle_timeout: 3600, // capped by max_upgrades
      disk_quota: 512,
      always_running: false,
    });
  });

  it("allow for much larger max_upgrades", () => {
    const site_settings = {
      max_upgrades: {
        // taken from cocalc-onprem example configuration
        memory: 32000,
        cores: 16,
      },
    };

    const site_license = {
      "123": {
        title: "123",
        quota: { cpu: 9, ram: 12, member: true },
        run_limit: 3,
        id: "123",
      },
      "321": {
        title: "321",
        quota: { cpu: 1, ram: 10, member: true },
        run_limit: 3,
        id: "321",
      },
    };
    const q1 = quota({}, { userX: {} }, site_license, site_settings);
    expect(q1).toEqual({
      always_running: false,
      cpu_limit: 10,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 22000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("allow for much larger max_upgrades /2", () => {
    const site_settings = {
      default_quotas: {
        internet: true,
        idle_timeout: 1800,
        mem: 2000,
        cpu: 1,
        cpu_oc: 20,
        mem_oc: 10,
      },
      max_upgrades: {
        disk_quota: 20000,
        memory: 50000,
        memory_request: 1000,
        cores: 16,
        network: 1,
        cpu_shares: 1024,
        mintime: 7776000,
        member_host: 1,
        ephemeral_state: 1,
        ephemeral_disk: 1,
        always_running: 1,
      },
      kucalc: "onprem",
      datastore: true,
    };

    const site_license: SiteLicenseQuotas = {
      a: {
        quota: { cpu: 2, ram: 13 },
      },
      b: {
        quota: { cpu: 3, ram: 32 },
      },
    };

    const q1 = quota_with_reasons(
      {},
      { userX: {} },
      site_license,
      site_settings,
    );
    expect(q1).toEqual({
      quota: {
        always_running: false,
        cpu_limit: 5,
        cpu_request: 0.25,
        disk_quota: DISK_QUOTA,
        idle_timeout: 1800,
        member_host: false,
        memory_limit: 45000,
        memory_request: 1000,
        network: true,
        privileged: false,
        gpu: false,
      },
      reasons: {},
    });
  });

  it("allow for much larger max_upgrades and take oc values into account", () => {
    const site_settings = {
      default_quotas: {
        mem_oc: 1,
        cpu_oc: 1,
      },
      max_upgrades: {
        // taken from cocalc-onprem example configuration
        memory: 32000,
        memory_request: 32000,
        cores: 16,
        cpu_shares: 16 * 1024,
      },
    };

    const site_license = {
      "123": {
        title: "123",
        quota: { cpu: 1, ram: 9, member: true },
        run_limit: 3,
        id: "123",
      },
      "321": {
        title: "321",
        quota: { cpu: 10, ram: 10, member: true },
        run_limit: 3,
        id: "321",
      },
    };
    const q1 = quota({}, { userX: {} }, site_license, site_settings);
    expect(q1).toEqual({
      always_running: false,
      cpu_limit: 11,
      cpu_request: 11,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 19000,
      memory_request: 19000,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("allow for much larger max_upgrades and cap at their max", () => {
    const site_settings = {
      default_quotas: {
        mem_oc: 1,
        cpu_oc: 1,
      },
      max_upgrades: {
        // taken from cocalc-onprem example configuration
        memory: 32000,
        memory_request: 32000,
        cores: 16,
        cpu_shares: 16 * 1024,
      },
    };

    const site_license = {
      "123": {
        title: "123",
        quota: { cpu: 12, ram: 20, member: true },
        run_limit: 3,
        id: "123",
      },
      "321": {
        title: "321",
        quota: { cpu: 10, ram: 20, member: true },
        run_limit: 3,
        id: "321",
      },
    };
    const q1 = quota({}, { userX: {} }, site_license, site_settings);
    expect(q1).toEqual({
      always_running: false,
      cpu_limit: 16,
      cpu_request: 16,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 32000,
      memory_request: 32000,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("takes overcommitment ratios into account for settings", () => {
    const site_settings = {
      default_quotas: {
        mem_oc: 4,
        cpu_oc: 5,
      },
    };

    const settings = {
      memory: 3444,
      cores: 1.5,
    };

    const q1 = quota(settings, undefined, undefined, site_settings);
    expect(q1.memory_request).toEqual(861);
    expect(q1.memory_limit).toEqual(3444);
    expect(q1.cpu_request).toEqual(0.3); // 1.5/5
    expect(q1.cpu_limit).toEqual(1.5);
  }); // sum

  it("sanitizes bad overcommitment ratios", () => {
    // too low values are limited at 1
    const site_settings = {
      default_quotas: {
        mem_oc: 0.25,
        cpu_oc: 0,
      },
    };

    const settings = {
      memory: 100,
      cores: 1,
    };

    const q1 = quota(settings, undefined, undefined, site_settings);
    expect(q1.memory_request).toEqual(1000);
    expect(q1.memory_limit).toEqual(1000);
    expect(q1.cpu_request).toEqual(1);
    expect(q1.cpu_limit).toEqual(1);
  });

  it("overcommitment with fractions", () => {
    // too low values are limited at 1
    const site_settings = {
      default_quotas: {
        mem_oc: 2.22,
        cpu_oc: 6.66,
      },
    };

    const settings = {
      memory: 234.56,
      cores: 0.234,
    };

    const q1 = quota(settings, undefined, undefined, site_settings);
    expect(q1.memory_request).toEqual(Math.floor(1000 / 2.22));
    expect(q1.memory_limit).toEqual(1000);
    expect(q1.cpu_request).toEqual(1 / 6.66);
    expect(q1.cpu_limit).toEqual(1);
  });

  it("takes overcommitment ratios into account for settings + site updates", () => {
    const site_settings = {
      default_quotas: {
        mem: 2000,
        mem_oc: 6,
        cpu: 2,
        cpu_oc: 10,
      },
    };

    const settings = {
      memory: 1000,
      cores: 0.5,
    };

    const q1 = quota(settings, undefined, undefined, site_settings);
    expect(q1.memory_request).toEqual(333);
    expect(q1.memory_limit).toEqual(2000);
    expect(q1.cpu_request).toEqual(0.2);
    expect(q1.cpu_limit).toEqual(2);
  });
});

describe("always running", () => {
  it("handles always_running admin upgrades", () => {
    const admin1 = quota({ member_host: 1, network: 1, always_running: 1 }, {});
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.05, // set at the top of quota config
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true, // what this upgrade is about
      memory_limit: 1000, // set at the top of quota config
      memory_request: 300, // set at the top of quota config
      network: true, // what this upgrade is about
      privileged: false,
      gpu: false,
      always_running: true,
    };
    expect(admin1).toEqual(exp);
  });

  it("always_running from a site_license", () => {
    const site_license = {
      "1234-5678-asdf-yxcv": {
        member_host: true,
        network: true,
        always_running: true,
      },
    };

    const q1 = quota({}, undefined, site_license);
    expect(q1.member_host).toBe(true);
    expect(q1.always_running).toBe(true);
    expect(q1.privileged).toBe(false);
    expect(q1.network).toBe(true);
  });
});

describe("site licenses", () => {
  it("site_license basic update as expected", () => {
    const site_license = {
      "1234-5432-3456-7654": {
        ram: 1,
        cpu: 1,
        disk: 3,
        member: true,
      },
    };
    const q = quota({}, {}, site_license);
    expect(q.idle_timeout).toBe(1800);
    expect(q).toEqual({
      idle_timeout: 1800,
      member_host: false,
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.02,
      disk_quota: DISK_QUOTA,
      memory_limit: 1000,
      memory_request: 200,
      network: false,
      privileged: false,
      gpu: false,
    });
  });

  it("site_license always_running do not mix", () => {
    const site_license: SiteLicenseQuotas = {
      a: {
        quota: {
          ram: 4,
          always_running: false,
        },
      },
      b: {
        quota: {
          ram: 2,
          always_running: true,
        },
      },
      c: {
        quota: {
          ram: 1,
          always_running: true,
        },
      },
    };
    const q = quota({}, undefined, site_license);
    expect(q.always_running).toBe(true);
    expect(q.memory_limit).toBe(3000);
  });

  it("site_license always_running do not mix incomplete 1", () => {
    const site_licenses: SiteLicenses = {
      a: {
        id: "a",
        quota: {
          ram: 4,
          always_running: true,
          member: false,
        },
      },
      b: {
        id: "b",
        quota: {
          ram: 2,
          member: true,
        },
      },
      c: {
        id: "c",
        quota: {
          ram: 1,
          always_running: false,
        },
      },
    };
    const q = quota({}, { userX: {} }, site_licenses);
    expect(q.always_running).toBe(true);
    expect(q.memory_limit).toBe(4000);
    expect(q.member_host).toBe(false);
  });

  it("site_license always_running do not mix incomplete 2", () => {
    const site_license: SiteLicenseQuotas = {
      a: {
        quota: {
          cpu: 2,
          ram: 2,
          disk: 2,
          member: true,
          dedicated_cpu: 1,
          dedicated_ram: 1,
          always_running: true,
        },
      },
      b: {
        quota: {
          ram: 4,
          dedicated_cpu: 1,
          dedicated_ram: 1,
          always_running: false,
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q.always_running).toBe(true);
    expect(q.memory_limit).toBe(3000);
    expect(q.member_host).toBe(true);
    expect(q.memory_request).toBe(1000);
    expect(q.cpu_limit).toBe(3);
    expect(q.cpu_request).toBe(1);
  });

  it("cap site_license upgrades by max_upgrades /1", () => {
    const site_license: SiteLicenseQuotas = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 10,
          dedicated_ram: 5,
          cpu: 2,
          dedicated_cpu: 5,
          disk: 10000,
          always_running: false,
          member: true,
          user: "academic",
        },
      },
      "4321-5678-asdf-yxcv": {
        quota: {
          ram: 7,
          dedicated_ram: 4,
          cpu: 5,
          dedicated_cpu: 2,
          disk: 60000,
          always_running: false,
          member: true,
          user: "academic",
        },
      },
    };

    // capped at default limits
    const q = quota({}, null, site_license);
    expect(q).toEqual({
      network: true,
      member_host: true,
      memory_request: 8000,
      cpu_request: 2,
      privileged: false,
      gpu: false,
      disk_quota: 20000,
      memory_limit: 16000,
      cpu_limit: 3,
      idle_timeout: 1800,
      always_running: false,
    });
  });

  it("cap site_license upgrades by max_upgrades /2", () => {
    const site_license: SiteLicenseQuotas = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 4,
          dedicated_ram: 3,
          cpu: 3,
          dedicated_cpu: 2,
          disk: 7500,
          always_running: true,
          member: true,
          user: "academic",
        },
      },
      "9876-5432-1098-6543": {
        quota: {
          ram: 2.1,
          dedicated_ram: 2.3,
          cpu: 2,
          dedicated_cpu: 1,
          disk: 4000,
          always_running: false,
          member: true,
          user: "academic",
        },
      },
    };

    const site_settings = {
      max_upgrades: {
        member_host: false,
        network: false,
        always_running: false,
        disk_quota: 333,
        mintime: 999,
        cpu_shares: 512,
        cores: 2,
        memory_request: 2500,
        memory: 4321,
      },
    };

    const q = quota({}, undefined, site_license, site_settings);
    expect(q).toEqual({
      network: false,
      member_host: false,
      always_running: false,
      memory_request: 2500, // lower cap is 2500
      memory_limit: 4321, // dedicated+shared in license > limit
      cpu_request: 0.5, // those 512 shares
      cpu_limit: 2,
      privileged: false,
      gpu: false,
      idle_timeout: 999,
      disk_quota: 333,
    });
  });

  it("site-license upgrades /1", () => {
    const site_license = {
      "1234-5678-asdf-yxcv": {
        member_host: true,
        network: true,
        memory: 3210,
        memory_request: 531,
        disk_quota: 345,
        cores: 1.5,
        mintime: 24 * 3600,
        cpu_shares: 1024 * 0.5,
      },
    };

    const q1 = quota({}, { userX: {} }, site_license);

    expect(q1).toEqual({
      idle_timeout: 24 * 3600 + 1800,
      memory_limit: 4210,
      memory_request: 531,
      cpu_limit: 2.5,
      cpu_request: 0.5,
      disk_quota: 1345,
      member_host: true,
      network: true,
      privileged: false,
      gpu: false,
      always_running: false,
    });
  });

  it("site-license quota upgrades /1", () => {
    const site_license: SiteLicenseQuotas = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 2,
          dedicated_ram: 1,
          cpu: 1,
          dedicated_cpu: 0.5,
          disk: 3,
          always_running: true,
          member: true,
          user: "academic",
        },
      },
    };
    const q1 = quota({}, undefined, site_license);

    expect(q1).toEqual({
      network: true,
      member_host: true,
      memory_request: 1000,
      cpu_request: 0.5,
      privileged: false,
      gpu: false,
      disk_quota: 3000,
      memory_limit: 3000,
      cpu_limit: 1.5,
      idle_timeout: 1800,
      always_running: true,
    });
  });

  it("uses different default_quotas", () => {
    const site_settings = {
      default_quotas: {
        internet: true,
        idle_timeout: 9999,
        cpu: 1.5,
        cpu_oc: 10,
        mem: 2000,
        mem_oc: 4,
        disk_quota: 5432,
      },
    };
    const q1 = quota({}, undefined, undefined, site_settings);
    expect(q1).toEqual({
      network: true,
      member_host: false,
      memory_request: 500, // OC 1:4 of 2000mb
      memory_limit: 2000, // default
      cpu_request: 0.15, // OC 1:10 and cpu 1.5
      cpu_limit: 1.5, // default
      privileged: false,
      gpu: false,
      idle_timeout: 9999,
      disk_quota: 5432,
      always_running: false,
    });
  });
});

describe("gpu quotas", () => {
  it("on-prem GPU/partial", () => {
    const site_license: SiteLicenseQuotas = {
      a: {
        quota: {
          member: true,
          cpu: 1,
          ram: 3,
          always_running: true,
          gpu: { num: 1 },
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q).toEqual({
      always_running: true,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 3000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: {
        num: 1,
      },
    });
  });

  it("on-prem GPU/full", () => {
    const site_license: SiteLicenseQuotas = {
      a: {
        quota: {
          member: true,
          cpu: 4,
          ram: 12,
          always_running: true,
          gpu: { num: 8, nodeLabel: "a=foo,bar=123", toleration: "iu=foo" },
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q).toEqual({
      always_running: true,
      cpu_limit: 3,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 12000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: {
        num: 8,
        nodeLabel: "a=foo,bar=123",
        toleration: "iu=foo",
      },
    });
  });
});

describe("idle timeout license", () => {
  it("licensed idle timeout / member + short", () => {
    const site_license: SiteLicenseQuotas = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 2,
          cpu: 1,
          disk: 4,
          member: true,
          user: "academic",
        },
      },
      "4321-5678-asdf-yxcv": {
        quota: {
          ram: 2,
          cpu: 1,
          disk: 1,
          idle_timeout: "short", // implies member: true!
          user: "academic",
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q).toEqual({
      idle_timeout: 30 * 60,
      member_host: true,
      network: true,
      privileged: false,
      gpu: false,
      always_running: false,
      memory_request: 300,
      memory_limit: 4000,
      cpu_request: 0.05,
      cpu_limit: 2,
      disk_quota: 5000,
    });
  });

  it("licensed idle timeout / don't mix short and medium", () => {
    const site_license: SiteLicenseQuotas = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 2,
          cpu: 2,
          disk: 6,
          idle_timeout: "medium", // "medium" is stronger than "short"
          user: "academic",
        },
      },
      "4321-5678-asdf-yxcv": {
        quota: {
          ram: 1,
          cpu: 1,
          disk: 4,
          idle_timeout: "short",
          user: "academic",
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q).toEqual({
      idle_timeout: 2 * 60 * 60,
      member_host: true,
      network: true,
      privileged: false,
      gpu: false,
      always_running: false,
      memory_request: 300,
      memory_limit: 2000, // only first license counts
      cpu_request: 0.05,
      cpu_limit: 2,
      disk_quota: 6000,
    });
  });

  it("licensed idle timeout / actually increasing idle_timeout", () => {
    const q0 = quota({}, {}, { l: { quota: { idle_timeout: "short" } } });
    const q1 = quota({}, {}, { l: { quota: { idle_timeout: "medium" } } });
    const q2 = quota({}, {}, { l: { quota: { idle_timeout: "day" } } });
    expect(q0.idle_timeout).toBe(30 * 60);
    expect(q1.idle_timeout).toBe(2 * 60 * 60);
    expect(q2.idle_timeout).toBe(24 * 60 * 60);
    expect(q0.member_host).toBe(true);
    expect(q1.member_host).toBe(true);
    expect(q2.member_host).toBe(true);
  });

  it("check order of license timeout keys", () => {
    expect(LicenseIdleTimeoutsKeysOrdered).toEqual(["short", "medium", "day"]);
  });

  it("licensed idle timeout / priority", () => {
    const site_licenses: SiteLicenses = {
      a: {
        id: "a",
        quota: {
          ram: 5,
          idle_timeout: "medium",
          always_running: false,
        },
      },
      b: {
        id: "b",
        quota: {
          ram: 2,
          idle_timeout: "day",
          always_running: false,
        },
      },
    };
    const q = quota({}, { userX: {} }, site_licenses);
    expect(q.always_running).toBe(false);
    expect(q.memory_limit).toBe(2000);
  });

  it("licensed idle timeout / priority 2", () => {
    const site_licenses: SiteLicenses = {
      a: {
        id: "a",
        quota: {
          ram: 5,
          idle_timeout: "short",
          always_running: false,
        },
      },
      b: {
        id: "b",
        quota: {
          ram: 2,
          idle_timeout: "medium",
          always_running: false,
        },
      },
    };
    const q = quota({}, { userX: {} }, site_licenses);
    expect(q.always_running).toBe(false);
    expect(q.memory_limit).toBe(2000);
  });

  it("licensed idle timeout / priority 3", () => {
    // always_running overrides idle_timeout
    const site_license: SiteLicenseQuotas = {
      a: {
        quota: {
          ram: 5,
          idle_timeout: "medium",
          always_running: true,
        },
      },
      b: {
        quota: {
          ram: 2,
          idle_timeout: "short",
          always_running: false,
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q.always_running).toBe(true);
    expect(q.memory_limit).toBe(5000);
  });

  it("licensed idle timeout / short (automatically member)", () => {
    const q0 = quota(
      {},
      {},
      { l: { quota: { idle_timeout: "short", member: false } } },
    );
    expect(q0.idle_timeout).toBe(30 * 60); // short
    expect(q0.member_host).toBe(false);

    const q1 = quota({}, {}, { l: { quota: { idle_timeout: "short" } } });
    expect(q1.idle_timeout).toBe(30 * 60); // short
    expect(q1.member_host).toBe(true);
  });

  it("licensed idle timeout / non member hosting medium", () => {
    const q0 = quota(
      {},
      {},
      { l: { quota: { idle_timeout: "medium", member: false } } },
    );
    expect(q0.idle_timeout).toBe(2 * 60 * 60); // medium
    expect(q0.member_host).toBe(false);
  });

  it("licensed idle timeout / mixed with always running", () => {
    const site_licenses: SiteLicenses = {
      a: {
        title: "AR,MH",
        quota: { cpu: 1, ram: 1, disk: 1, member: true, always_running: true },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      b: {
        title: "",
        quota: {
          cpu: 1,
          user: "academic",
          dedicated_ram: 0,
          always_running: false,
          idle_timeout: "short",
          dedicated_cpu: 0,
          member: true,
          disk: 1,
          ram: 2,
        },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };
    const q = quota({}, {}, site_licenses);
    const ito = 1800;
    expect(q.idle_timeout).toBe(ito);
    expect(q).toEqual({
      always_running: true,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: ito,
      member_host: true,
      memory_limit: 1000, // 1000 min for members
      memory_request: 300, // oc ratio
      network: true,
      privileged: false,
      gpu: false,
    });
  });
});

// a boost license has quota.boost === true
describe("boost", () => {
  it("add 4 gb ram to a small license", () => {
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: { cpu: 1, ram: 1, disk: 1, member: true },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost: {
        quota: { ram: 4, member: true, boost: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 5000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("add 1 core and 3 gb ram to a 1day idle license", () => {
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: { cpu: 1, ram: 1, disk: 1, member: true, idle_timeout: "day" },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost: {
        quota: {
          cpu: 1,
          ram: 3,
          member: true,
          boost: true,
          idle_timeout: "day",
        },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 2,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 86400,
      member_host: true,
      memory_limit: 4000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("works with more than one maching boost license", () => {
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: { cpu: 1, ram: 1, disk: 1, member: true, always_running: true },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost1: {
        quota: { ram: 5, member: true, boost: true, always_running: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
      boost2: {
        quota: {
          cpu: 1,
          disk: 5,
          member: true,
          boost: true,
          always_running: true,
        },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b15",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: true,
      cpu_limit: 2,
      cpu_request: 0.05,
      disk_quota: 6000, // all 3 licenses
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 6000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("selects the matching boost license (always running)", () => {
    const site_licenses: SiteLicenses = {
      regular1: {
        title: "standard",
        quota: {
          cpu: 1,
          ram: 1,
          disk: 1,
          member: true,
          idle_timeout: "medium",
        },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      regular2: {
        title: "standard",
        quota: { cpu: 1, ram: 2, disk: 1, member: true, always_running: true },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost1: {
        quota: { ram: 5, member: true, boost: true, idle_timeout: "medium" },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
      boost2: {
        quota: {
          cpu: 1,
          disk: 3,
          member: true,
          boost: true,
          always_running: true,
        },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b15",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: true,
      cpu_limit: 2,
      cpu_request: 0.05,
      disk_quota: 4000,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 2000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("selects the matching boost license (medium timeout)", () => {
    const site_licenses: SiteLicenses = {
      regular1: {
        title: "standard",
        quota: {
          cpu: 1,
          ram: 1,
          disk: 1,
          member: true,
          idle_timeout: "medium",
        },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      regular2: {
        title: "standard",
        quota: { cpu: 1, ram: 2, disk: 1, member: true },
        run_limit: 1,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost1: {
        quota: { ram: 5, member: true, boost: true, idle_timeout: "medium" },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
      boost2: {
        quota: {
          cpu: 1,
          disk: 7,
          member: true,
          boost: true,
          always_running: true,
        },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b15",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA, // default
      idle_timeout: 7200, // both selected licenses are medium
      member_host: true,
      memory_limit: 6000, // both medium from above
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("rejects a single boost license", () => {
    const site_licenses: SiteLicenses = {
      boost: {
        quota: { ram: 4, member: true, boost: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.02,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: false,
      memory_limit: 1000,
      memory_request: 200,
      network: false,
      privileged: false,
      gpu: false,
    });
  });

  it("rejects an incompatible boost license (member hosting)", () => {
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: { cpu: 2, ram: 1, disk: 1, member: true },
        run_limit: 3,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost: {
        quota: { ram: 4, boost: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 2,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 1000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });

  it("rejects an incompatible boost license (idle timeout)", () => {
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: {
          cpu: 1,
          ram: 2,
          disk: 1,
          member: true,
          idle_timeout: "medium",
        },
        run_limit: 3,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      boost: {
        quota: { ram: 4, member: true, boost: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: DISK_QUOTA,
      idle_timeout: 7200,
      member_host: true,
      memory_limit: 2000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });
});

describe("quota calculation with rejection reasons", () => {
  it("rejects an incompatible boost license (idle timeout)", () => {
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: {
          cpu: 1,
          ram: 2,
          disk: 1,
          member: true,
          idle_timeout: "medium",
        },
        run_limit: 3,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      "1234-boost": {
        quota: { ram: 4, member: true, boost: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = reasons({}, {}, site_licenses);

    expect(q.reasons).toEqual({ "1234-boost": "hosting_incompatible" });
  });
});

describe("cobine quota/patch with regular licenses", () => {
  it("applies the license and the patch", () => {
    const patch1 = [
      { op: "replace", path: "/foo", value: "bar" },
      { op: "add", path: "/bar/baz/-", value: [1, 2, 3] },
    ] as const;
    const patch2 = [{ op: "replace", path: "/zetta", value: "zulu" }] as const;
    // NOTE member is true/false, but all patches apply
    const site_licenses: SiteLicenses = {
      standard: {
        id: "standard",
        title: "standard",
        quota: {
          cpu: 1,
          ram: 2,
          member: true,
        },
      },
      patch1: {
        id: "patch1",
        title: "patch1",
        quota: {
          cpu: 1,
          member: false,
          patch: JSON.stringify(patch1),
        },
      },
      patch2: {
        id: "patch2",
        title: "patch2",
        quota: {
          cpu: 2,
          member: true,
          patch: JSON.stringify(patch2),
        },
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 3,
      cpu_request: 0.05,
      patch: [...deep_copy(patch1), ...deep_copy(patch2)],
      disk_quota: DISK_QUOTA,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 2000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });
});

describe("combine ext_rw with regular licenses", () => {
  it("applies the license and the patch", () => {
    // NOTE: member is true vs. false, but ext_rw still applies
    const site_licenses: SiteLicenses = {
      regular: {
        title: "standard",
        quota: {
          cpu: 1,
          ram: 2,
          disk: 3,
          member: true,
          idle_timeout: "medium",
        },
        run_limit: 3,
        id: "eb5ae598-1350-48d7-88c7-ee599a967e81",
      },
      patch: {
        quota: { cpu: 1, ram: 1, member: false, ext_rw: true },
        run_limit: 1,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: 3000,
      ext_rw: true,
      idle_timeout: 7200,
      member_host: true,
      memory_limit: 2000,
      memory_request: 300,
      network: true,
      privileged: false,
      gpu: false,
    });
  });
});

describe("test heuristic to classify a boost license", () => {
  it("detects a regular boost license", () => {
    const l1 = {
      quota: {
        cpu: 0,
        ram: 2,
        disk: 0,
        member: true,
        boost: true,
      },
    };
    expect(isBoostLicense(l1)).toBe(true);
  });

  it("detects a regular boost without a boost field", () => {
    const l1 = {
      quota: {
        cpu: 0,
        ram: 2,
        disk: 0,
      },
    };
    expect(isBoostLicense(l1)).toBe(true);
  });

  it("detects a regular license with a boost field", () => {
    const l1 = {
      quota: {
        cpu: 1,
        ram: 2,
        disk: 3,
        member: true,
        timeout: "medium",
        boost: false,
      },
    };
    expect(isBoostLicense(l1)).toBe(false);
  });

  it("detects a regular license without a boost field", () => {
    const l1 = {
      quota: {
        cpu: 1,
        ram: 2,
        disk: 3,
      },
    };
    expect(isBoostLicense(l1)).toBe(false);
  });

});

describe("test pay-you-go-quota inclusion", () => {
  it("combines with all the others being empty", () => {
    const z = quota(
      { memory: 8000 },
      {},
      {},
      {},
      {
        quota: {
          memory: 5000,
          cores: 2,
          mintime: 3600,
          disk_quota: 5500,
          network: 1,
          always_running: 1,
          member_host: 1,
        },
        account_id: "752be8c3-ff74-41d8-ad1c-b2fb92c3e7eb",
      },
    );
    expect(z).toStrictEqual({
      always_running: true,
      cpu_limit: 2,
      cpu_request: 0.05,
      disk_quota: 5500,
      idle_timeout: 3600,
      member_host: true,
      memory_limit: 8000,
      memory_request: 300,
      network: true,
      pay_as_you_go: {
        account_id: "752be8c3-ff74-41d8-ad1c-b2fb92c3e7eb",
        quota: {
          always_running: 1,
          cores: 2,
          disk_quota: 5500,
          member_host: 1,
          memory: 5000,
          mintime: 3600,
          network: 1,
        },
      },
      privileged: false,
      gpu: false,
    });
  });
});
