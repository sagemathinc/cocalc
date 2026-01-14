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
import { quota as quota0 } from "./upgrades/quota";
const quota = quota0 as (a?, b?, c?, d?, e?) => ReturnType<typeof quota0>;

const DISK_QUOTA = 1000;

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
    const q = quota(settings, undefined, site_settings);
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
    const q = quota(settings, undefined, site_settings);
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

    const q1 = quota({}, undefined, site_settings);
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
    const q1 = quota({}, { userX: {} }, site_settings);
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

    const q1 = quota({}, { userX: {} }, site_settings);
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

    const q1 = quota({}, { userX: {} }, site_settings);
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

});

describe("test pay-you-go-quota inclusion", () => {
  it("combines with all the others being empty", () => {
    const z = quota(
      { memory: 8000 },
      {},
      undefined,
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
