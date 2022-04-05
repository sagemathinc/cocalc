/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this tests kucalc's quota function
//
// after any change to quota.ts, be a good citizen and run this test or even extend it
// …/packages/util/test$ SMC_DB_RESET=true SMC_TEST=true npx jest quota.test.ts  [--watch]

// import * as init from "./init";
//let db = undefined;
//const setup = (cb) =>
//  init.setup(function (err) {
//    db = init.db();
//    cb(err);
//  });
//const { teardown } = init;

// make TS happy, despite @types/jest is installed
declare const describe: Function;
declare const it: Function;

import expect from "expect";
const { quota } = require("@cocalc/util/upgrades/quota");
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { LicenseIdleTimeoutsKeysOrdered } from "@cocalc/util/consts/site-license";
import { SiteLicenses } from "../types/site-licenses";

describe("main quota functionality", () => {
  it("basics are fine", () => {
    // quota should work without any arguments
    const basic = quota();
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.02,
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: false,
      memory_limit: 1000,
      memory_request: 200,
      network: false,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(basic).toEqual(exp);
  });

  it("gives members a bit more memory by default", () => {
    const member = quota({}, { userX: { upgrades: { member_host: 1 } } });
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.05, // set at the top of quota config
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: true, // what this upgrade is about
      memory_limit: 1500, // set at the top of quota config
      memory_request: 300, // set at the top of quota config
      network: false,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(member).toEqual(exp);
  });

  it("respects admin member/network upgrades", () => {
    const admin1 = quota({ member_host: 1, network: 1 }, {});
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.05, // set at the top of quota config
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: true, // what this upgrade is about
      memory_limit: 1500, // set at the top of quota config
      memory_request: 300, // set at the top of quota config
      network: true, // what this upgrade is about
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(admin1).toEqual(exp);
  });

  it("adds up user contributions", () => {
    const users = {
      user1: {
        upgrades: {
          network: 1,
          memory: 1500,
          memory_request: 2500,
          cpu_shares: 1024 * 0.33,
        },
      },
      user2: {
        upgrades: {
          member_host: 1,
          network: 1,
          memory: 123,
          cores: 0.5,
          disk_quota: 1000,
        },
      },
      user3: {
        upgrades: {
          mintime: 99,
          memory: 7,
        },
      },
    };
    const added = quota({}, users);
    const exp = {
      network: true,
      member_host: true,
      memory_request: 2500,
      memory_limit: 2630, // 1000 mb free
      cpu_request: 0.33,
      cpu_limit: 1.5, // 1 for free
      privileged: false,
      idle_timeout: 1899, // 1800 secs free
      disk_quota: 4000,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(added).toEqual(exp);
  });

  it("do NOT set limits >= requests -- manage pod in kucalc does that", () => {
    const users = {
      user1: {
        upgrades: {
          member_host: true,
          network: true,
          memory_request: 3210,
        },
      },
    };

    const exp = {
      network: true,
      member_host: true,
      memory_request: 3210,
      memory_limit: 1500, // 1500 mb free for members
      cpu_request: 0.05,
      cpu_limit: 1,
      privileged: false,
      idle_timeout: 1800, // 1800 secs free
      disk_quota: 3000,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(quota({}, users)).toEqual(exp);
  });

  it("caps user upgrades at their maximum", () => {
    const over_max = {
      user2: {
        upgrades: {
          network: 2,
          member_host: 3,
          disk_quota: 32000, // max 20gb
          memory: 20000, // max 16gb
          mintime: 24 * 3600 * 100, // max 90 days
          memory_request: 10000, // max 8gb
          cores: 7, // max 3
          cpu_shares: 1024 * 4,
        },
      }, // max 2 requests
    };

    const maxedout = quota({}, over_max);
    const exp = {
      cpu_limit: 3,
      cpu_request: 2, // set at the top of quota config
      disk_quota: 20000,
      idle_timeout: 24 * 3600 * 90,
      member_host: true,
      memory_limit: 16000, // set at the top of quota config
      memory_request: 8000, // set at the top of quota config
      network: true,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(maxedout).toEqual(exp);
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
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(maxedout).toEqual(exp);
  });

  it("combines admin and user upgrades properly", () => {
    const settings = {
      network: 1,
      member_host: 0,
      disk_quota: 19000, // max 20gb
      memory: 1000, // max 16gb
      mintime: 24 * 3600 * 33, // max 90 days
      memory_request: 1000, // max 8gb
      cores: 1, // max 2 shared
      cpu_shares: 0.1 * 1024,
    };

    const users = {
      user1: {
        upgrades: {
          member_host: true,
          network: true,
          memory_request: 3210,
          disk_quota: 3000, // settings are already near max
          cores: 2,
          mintime: 24 * 3600 * 50,
          cpu_shares: 1024 * 0.5,
        },
      },
      user2: {
        upgrades: {
          member_host: true,
          network: true,
          cores: 2,
          mintime: 24 * 3600 * 50,
        },
      },
    };

    const exp = {
      network: true,
      member_host: true,
      memory_request: 4210,
      memory_limit: 1500, // 1500 mb free for members
      cpu_request: 0.5 + 0.1,
      cpu_limit: 3,
      privileged: false,
      idle_timeout: 24 * 3600 * (Math.min(90, 50 + 50) + 33) - 1800, // 1800 secs free
      disk_quota: 22000,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(quota(settings, users)).toEqual(exp);
  });

  it("admin upgrades can move user upgrades beyond the limit", () => {
    const settings = { memory: 5000 };

    const users = {
      user1: {
        upgrades: {
          member_host: true,
          network: true,
          memory: 15000,
          memory_request: 2000,
        },
      },
    };

    const exp = {
      network: true,
      member_host: true,
      memory_limit: 20000,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: 3000,
      idle_timeout: 1800,
      memory_request: 2000,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    };

    expect(quota(settings, users)).toEqual(exp);
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
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("does not allow privileged updates for users", () => {
    const users = { user1: { upgrades: { privileged: 1 } } };
    const q = quota({}, users);
    expect(q.privileged).toBe(false);
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
    const users = {
      user1: {
        upgrades: {
          cpu_request: 0,
          memory_request: 0,
          memory_limit: 0,
        },
      },
    };

    const q = quota(settings, users);
    expect(q.cpu_request).toBeGreaterThan(0.01);
    expect(q.memory_request).toBeGreaterThan(100);
    expect(q.memory_limit).toBeGreaterThan(100);
  });

  it("caps depending on free vs. member", () => {
    const free = { user1: { upgrades: { member_host: 0 } } };
    const member = { user2: { upgrades: { member_host: 1 } } };
    const qfree = quota({}, free);
    const qmember = quota({}, member);

    // checking two of them explicitly
    expect(qfree.cpu_request).toBe(0.02);
    expect(qmember.cpu_request).toBe(0.05);

    // members get strictly more than free users
    expect(qfree.cpu_request).toBeLessThan(qmember.cpu_request);
    expect(qfree.memory_request).toBeLessThan(qmember.memory_request);
    expect(qfree.memory_limit).toBeLessThan(qmember.memory_limit);
  });

  it("partial site_settings1/mem", () => {
    const site_settings = {
      default_quotas: { internet: true, idle_timeout: 3600, mem_oc: 5 },
    };
    const member = { user2: { upgrades: { member_host: 1, memory: 4100 } } };
    const q = quota({}, member, undefined, site_settings);
    expect(q).toEqual({
      idle_timeout: 3600,
      memory_limit: 5100,
      memory_request: 1020, // (4100 + 1000) / 5
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: 3000,
      member_host: true,
      network: true,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
    const member = { user2: { upgrades: { network: 1, cores: 1.4 } } };
    const q = quota({}, member, undefined, site_settings);
    expect(q).toEqual({
      idle_timeout: 9999,
      memory_limit: 1000,
      memory_request: 500,
      cpu_limit: 2.4,
      cpu_request: 0.24,
      disk_quota: 5432,
      member_host: false,
      network: true,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("respect different (lower) max_upgrades", () => {
    const site_settings = {
      max_upgrades: {
        member_host: 0,
        disk_quota: 616, // only disk quota is below the hardcoded default
        memory: 1515,
        mintime: 4345,
        memory_request: 505,
        cores: 3.14,
        cpu_shares: 2.2 * 1024,
      },
    };

    const over_max = {
      user2: {
        upgrades: {
          network: 2,
          member_host: 3,
          disk_quota: 32000, // max 20gb
          memory: 20000, // max 16gb
          mintime: 24 * 3600 * 100, // max 90 days
          memory_request: 10000, // max 8gb
          cores: 7, // max 3
          cpu_shares: 1024 * 4,
        },
      }, // max 2 requests
    };

    const maxedout = quota({}, over_max, undefined, site_settings);
    expect(maxedout).toEqual({
      cpu_limit: 3.14,
      cpu_request: 2.2,
      disk_quota: 616,
      idle_timeout: 4345,
      member_host: false,
      memory_limit: 1515,
      memory_request: 505,
      network: true,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("respect different (lower) max_upgrades /2", () => {
    // here, we go well below the default everywhere
    const site_settings = {
      max_upgrades: {
        member_host: 0,
        network: 0,
        always_running: 0,
        disk_quota: 616,
        memory: 512,
        mintime: 300,
        memory_request: 64,
        cores: 0.5,
        cpu_shares: 256,
      },
    };

    const over_max = {
      user2: {
        upgrades: {
          network: 2,
          member_host: 3,
          always_running: 4,
          disk_quota: 32000, // max 20gb
          memory: 20000, // max 16gb
          mintime: 24 * 3600 * 100, // max 90 days
          memory_request: 10000, // max 8gb
          cores: 7, // max 3
          cpu_shares: 1024 * 4,
        },
      },
    };

    const maxedout = quota({}, over_max, undefined, site_settings);
    expect(maxedout).toEqual({
      network: false,
      member_host: false,
      privileged: false,
      memory_request: 64,
      cpu_request: 0.25,
      disk_quota: 616,
      memory_limit: 512,
      cpu_limit: 0.5,
      idle_timeout: 300,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
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

    const over_max = {
      user2: {
        upgrades: {
          network: 1,
          member_host: 1,
        },
      },
    };

    const q1 = quota({}, over_max, undefined, site_settings);
    expect(q1).toEqual({
      network: false,
      member_host: false,
      privileged: false,
      memory_request: 1, // below minimum cap, because max_upgrades in settings are stronger than hardcoded vals
      cpu_request: 0.02,
      disk_quota: 333,
      memory_limit: 1000,
      cpu_limit: 0.44, // below minimum cap, because max_upgrades in settings are stronger than hardcoded vals
      idle_timeout: 999,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
      idle_timeout: 3600, // capped by max_upgrades
      disk_quota: 512,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
      idle_timeout: 1800,
      disk_quota: 3000,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
      idle_timeout: 3600, // capped by max_upgrades
      disk_quota: 512,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("takes overcommitment ratios into account for user upgrades", () => {
    const site_settings = {
      default_quotas: {
        mem_oc: 4,
        cpu_oc: 5,
      },
    };

    const users = {
      user1: {
        upgrades: {
          memory: 3444,
          cores: 1.5,
        },
      },
    };

    const q1 = quota({}, users, undefined, site_settings);
    expect(q1.memory_request).toEqual(1111);
    expect(q1.memory_limit).toEqual(4444);
    expect(q1.cpu_request).toEqual(0.5); // (1+1.5)/5
    expect(q1.cpu_limit).toEqual(2.5);
  }); // sum

  it("sanitizes bad overcommitment ratios", () => {
    // too low values are limited at 1
    const site_settings = {
      default_quotas: {
        mem_oc: 0.25,
        cpu_oc: 0,
      },
    };

    const users = {
      user1: {
        upgrades: {
          memory: 100,
          cores: 1,
        },
      },
    };

    const q1 = quota({}, users, undefined, site_settings);
    expect(q1.memory_request).toEqual(1100);
    expect(q1.memory_limit).toEqual(1100);
    expect(q1.cpu_request).toEqual(2);
    expect(q1.cpu_limit).toEqual(2);
  });

  it("overcommitment with fractions", () => {
    // too low values are limited at 1
    const site_settings = {
      default_quotas: {
        mem_oc: 2.22,
        cpu_oc: 6.66,
      },
    };

    const users = {
      user1: {
        upgrades: {
          memory: 234.56,
          cores: 0.234,
        },
      },
    };

    const q1 = quota({}, users, undefined, site_settings);
    expect(q1.memory_request).toEqual(Math.round(1234 / 2.22));
    expect(q1.memory_limit).toEqual(1234);
    expect(q1.cpu_request).toEqual(1.234 / 6.66);
    expect(q1.cpu_limit).toEqual(1.234);
  });

  it("takes overcommitment ratios into account for user upgrades + site updates", () => {
    const site_settings = {
      default_quotas: {
        mem: 2000,
        mem_oc: 6,
        cpu: 2,
        cpu_oc: 10,
      },
    };

    const users = {
      user1: {
        upgrades: {
          memory: 1000,
          cores: 0.5,
        },
      },
    };

    const q1 = quota({}, users, undefined, site_settings);
    expect(q1.memory_request).toEqual(500);
    expect(q1.memory_limit).toEqual(3000);
    expect(q1.cpu_request).toEqual(0.25);
    expect(q1.cpu_limit).toEqual(2.5);
  });
});

describe("always running", () => {
  it("handles always_running admin upgrades", () => {
    const admin1 = quota({ member_host: 1, network: 1, always_running: 1 }, {});
    const exp = {
      cpu_limit: 1,
      cpu_request: 0.05, // set at the top of quota config
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: true, // what this upgrade is about
      memory_limit: 1500, // set at the top of quota config
      memory_request: 300, // set at the top of quota config
      network: true, // what this upgrade is about
      privileged: false,
      always_running: true,
      dedicated_disks: [],
      dedicated_vm: false,
    };
    expect(admin1).toEqual(exp);
  });

  it("takes user always_running upgrades into account", () => {
    const member = quota(
      {},
      { userX: { upgrades: { member_host: 1, always_running: 1 } } }
    );

    expect(member.always_running).toBe(true);
    expect(member.member_host).toBe(true);
  });

  it("always_running from a site_license", () => {
    const site_license = {
      "1234-5678-asdf-yxcv": {
        member_host: true,
        network: true,
        always_running: true,
      },
    };

    const q1 = quota({}, { userX: {} }, site_license);
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
      disk_quota: 3000,
      memory_limit: 1000,
      memory_request: 200,
      network: false,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("site_license 'complements' user upgrades", () => {
    const site_license = {
      "1234-5432-3456-7654": {
        quota: {
          ram: 2,
          cpu: 1.5,
          disk: 5,
          member: true,
        },
      },
    };
    const users = {
      user1: {
        upgrades: {
          member_host: false,
          network: true,
          memory_request: 1234,
          memory: 2345,
          mintime: 24 * 3600 * 50,
        },
      },
    };
    const q = quota({}, users, site_license);
    // user quota + basic upgrade
    expect(q.idle_timeout).toBe(24 * 3600 * 50 + 1800);
    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1.5, // license
      cpu_request: 0.05, // implied by license member hosting
      disk_quota: 5000, // license
      idle_timeout: 4321800, // upgrade
      member_host: true, // license
      memory_limit: 2345 + 1000, // upgrade + base
      memory_request: 1234, // upgrade
      network: true, // both
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("site_license always_running do not mix", () => {
    const site_license = {
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
    const q = quota({}, { userX: {} }, site_license);
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
    const site_license = {
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
    const site_license = {
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
      disk_quota: 20000,
      memory_limit: 16000,
      cpu_limit: 3,
      idle_timeout: 1800,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("cap site_license upgrades by max_upgrades /2", () => {
    const site_license = {
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

    const users = {
      user1: {
        upgrades: {
          memory: 1313,
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

    const q = quota({}, users, site_license, site_settings);
    expect(q).toEqual({
      network: false, // user upgrade not allowed
      member_host: false, // user upgrade not allowed
      always_running: false, // user upgrade not allowed
      memory_request: 2500, // lower cap is 2500
      memory_limit: 4321, // dedicated+shared in license > limit
      cpu_request: 0.5, // those 512 shares
      cpu_limit: 2,
      privileged: false,
      idle_timeout: 999,
      disk_quota: 333,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("cap site_license upgrades by max_upgrades /3", () => {
    const site_license = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 1,
          dedicated_ram: 0,
          cpu: 1,
          dedicated_cpu: 0,
          disk: 2000,
          always_running: false,
          member: true,
          user: "academic",
        },
      },
    };

    // dominating site license upgrade
    const users = {
      user1: {
        upgrades: {
          network: 2,
          member_host: 3,
          disk_quota: 32000, // max 20gb
          memory: 20000, // max 16gb
          mintime: 24 * 3600 * 100, // max 90 days
          memory_request: 10000, // max 8gb
          cores: 7, // max 3
          cpu_shares: 1024 * 4,
        },
      },
    };

    const q = quota({}, users, site_license);
    expect(q).toEqual({
      cpu_limit: 3,
      cpu_request: 2, // set at the top of quota config
      disk_quota: 20000,
      idle_timeout: 24 * 3600 * 90,
      member_host: true,
      memory_limit: 16000, // set at the top of quota config
      memory_request: 8000, // set at the top of quota config
      network: true,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
      disk_quota: 3345, // 3gb free
      member_host: true,
      network: true,
      privileged: false,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("site-license upgrades /2", () => {
    const site_license = {
      "1234-5678-asdf-yxcv": {
        // will be ignored
        member_host: true,
        network: true,
        disk_quota: 222,
      },
      "1234-5678-asdf-asdf": {
        disk_quota: 111,
        always_running: true,
      },
      "333-5678-asdf-asdf": {
        disk_quota: 333,
        always_running: true,
      },
    };

    const users = {
      user1: {
        upgrades: {
          network: 1,
          memory: 1234,
          disk_quota: 321,
        },
      },
      user2: {
        upgrades: {
          cores: 0.25,
        },
      },
    };

    const q1 = quota({}, users, site_license);

    expect(q1.memory_limit).toEqual(2234);
    // not +222, because always_running has higher priority than member hosting
    expect(q1.disk_quota).toBe(3000 + 321 + 111 + 333);
    expect(q1.member_host).toBe(false);
    expect(q1.network).toBe(true);
    expect(q1.cpu_limit).toBe(1.25);
    expect(q1.always_running).toBe(true);
  });

  it("site-license quota upgrades /1", () => {
    const site_license = {
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
    const users = {
      user1: {
        upgrades: {
          memory: 1313, // maxed with "ram"
        },
      },
    };
    const q1 = quota({}, users, site_license);

    expect(q1).toEqual({
      network: true,
      member_host: true,
      memory_request: 1000,
      cpu_request: 0.5,
      privileged: false,
      disk_quota: 3000,
      memory_limit: 3000,
      cpu_limit: 1.5,
      idle_timeout: 1800,
      always_running: true,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("site-license quota upgrades /2", () => {
    const site_license = {
      "1234-5678-asdf-yxcv": {
        quota: {
          ram: 2,
          cpu: 1.5,
          disk: 3,
          always_running: true,
          member: true,
          user: "academic",
        },
      },
    };
    const users = {
      user1: {
        upgrades: {
          memory: 4321, // +1gb base quota, maxed with "ram"
        },
      },
    };
    const q1 = quota({}, users, site_license);

    expect(q1).toEqual({
      network: true,
      member_host: true,
      memory_request: 300,
      cpu_request: 0.05,
      privileged: false,
      disk_quota: 3000,
      memory_limit: 5321,
      cpu_limit: 1.5,
      idle_timeout: 1800,
      always_running: true,
      dedicated_disks: [],
      dedicated_vm: false,
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
    const q1 = quota({}, { userX: {} }, undefined, site_settings);
    expect(q1).toEqual({
      network: true,
      member_host: false,
      memory_request: 500, // OC 1:4 of 2000mb
      memory_limit: 2000, // default
      cpu_request: 0.15, // OC 1:10 and cpu 1.5
      cpu_limit: 1.5, // default
      privileged: false,
      idle_timeout: 9999,
      disk_quota: 5432,
      always_running: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });
});

describe("dedicated", () => {
  it("dedicated vm do not mix with quotas /1", () => {
    const site_license = {
      a1: {
        quota: {
          dedicated_vm: { machine: "n2-highmem-8", name: "foo" },
        },
      },
      a2: {
        quota: {
          dedicated_disk: { type: "standard", size_gb: 128, name: "bar" },
        },
      },
      b: {
        quota: {
          ram: 2,
          always_running: false,
        },
      },
      c: {
        quota: {
          cpu: 2,
          ram: 1,
          always_running: false,
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    // projects on dedicated VMs get this quota
    expect(q).toEqual({
      network: true, // paying user
      member_host: true, // for the UI, not functionality
      always_running: true, // included for dedi VMs
      memory_request: 0, // irrelevant
      memory_limit: 62000, // according to VM specs
      cpu_request: 0, // irrelevant
      cpu_limit: 8, // according to VM specs
      privileged: false,
      idle_timeout: 1800, // default, just > 0, always_running is true anyways
      disk_quota: 3000,
      dedicated_disks: [{ type: "standard", size_gb: 128, name: "bar" }],
      dedicated_vm: { machine: "n2-highmem-8", name: "foo" },
    });
  });

  it("dedicated vm do not mix with quotas /2", () => {
    const site_license = {
      a1: {
        quota: {
          dedicated_vm: { machine: "n2-standard-4" },
          dedicated_disk: { type: "standard", size_gb: 128 },
        },
      },
    };
    const spec = PRICES.vms["n2-standard-4"].spec;
    const q = quota({}, { userX: {} }, site_license);
    expect(q.dedicated_vm.machine).toBe("n2-standard-4");
    expect(q.always_running).toBe(true);
    expect(q.member_host).toBe(true);
    expect(q.network).toBe(true);
    expect(q.dedicated_disks.length).toBe(1);
    expect(q.memory_limit).toBe(1000 * spec.mem);
    expect(q.cpu_limit).toBe(4);
  });

  it("several dedicated disks", () => {
    const site_license = {
      a: {
        quota: {
          dedicated_disk: { type: "standard", size_gb: 512 },
        },
      },
      b: {
        quota: {
          dedicated_disk: { type: "ssd", size_gb: 128 },
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(q.dedicated_disks.length).toBe(2);
  });

  it("only one dedicated VM", () => {
    const site_license = {
      a: {
        quota: {
          dedicated_vm: { machine: "n2-standard-4" },
        },
      },
      b: {
        quota: {
          dedicated_vm: { machine: "n2-highmem-4" },
        },
      },
    };
    const q = quota({}, { userX: {} }, site_license);
    expect(["n2-standard-4", "n2-highmem-4"]).toContain(q.dedicated_vm.machine);
  });
});

describe("idle timeout license", () => {
  it("licensed idle timeout / member + short", () => {
    const site_license = {
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
      always_running: false,
      memory_request: 300,
      memory_limit: 4000,
      cpu_request: 0.05,
      cpu_limit: 2,
      disk_quota: 5000,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("licensed idle timeout / don't mix short and medium", () => {
    const site_license = {
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
      always_running: false,
      memory_request: 300,
      memory_limit: 2000, // only first license counts
      cpu_request: 0.05,
      cpu_limit: 2,
      disk_quota: 6000,
      dedicated_disks: [],
      dedicated_vm: false,
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
    const site_license = {
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
      { l: { quota: { idle_timeout: "short", member: false } } }
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
      { l: { quota: { idle_timeout: "medium", member: false } } }
    );
    expect(q0.idle_timeout).toBe(2 * 60 * 60); // medium
    expect(q0.member_host).toBe(false);
  });

  it("licensed idle timeout / mixed with user upgrades", () => {
    // NOTE: there are no precautions against this, but it's not recommended
    const site_license = {
      "1234-5432-3456-7654": {
        quota: {
          ram: 2,
          cpu: 1.5,
          disk: 5,
          idle_timeout: "short",
          member: true,
        },
      },
    };
    const users = {
      user1: {
        upgrades: {
          member_host: false,
          network: true,
          memory_request: 1234,
          memory: 2345,
          mintime: 3600,
        },
      },
    };
    const q = quota({}, users, site_license);
    // user quota + basic upgrade
    const ito = 3600 + 1800;
    expect(q.idle_timeout).toBe(ito);
    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1.5, // license
      cpu_request: 0.05, // implied by license member hosting
      disk_quota: 5000, // license
      idle_timeout: ito, // upgrade
      member_host: true, // license
      memory_limit: 2345 + 1000, // upgrade + base
      memory_request: 1234, // upgrade
      network: true, // both
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
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
      disk_quota: 3000,
      idle_timeout: ito,
      member_host: true,
      memory_limit: 1500, // 1500 min for members
      memory_request: 300, // oc ratio
      network: true,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 5000,
      memory_request: 300,
      network: true,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
        quota: { cpu: 1, ram: 3, member: true, boost: true, idle_timeout: "day" },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b13",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 2,
      cpu_request: 0.05,
      disk_quota: 3000,
      idle_timeout: 86400,
      member_host: true,
      memory_limit: 4000,
      memory_request: 300,
      network: true,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
        quota: { cpu: 1, disk: 5, member: true, boost: true, always_running: true },
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
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });


  it("selects the matching boost license (always running)", () => {
    const site_licenses: SiteLicenses = {
      regular1: {
        title: "standard",
        quota: { cpu: 1, ram: 1, disk: 1, member: true, idle_timeout: "medium" },
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
        quota: { cpu: 1, disk: 3, member: true, boost: true, always_running: true },
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
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });


  it("selects the matching boost license (medium timeout)", () => {
    const site_licenses: SiteLicenses = {
      regular1: {
        title: "standard",
        quota: { cpu: 1, ram: 1, disk: 1, member: true, idle_timeout: "medium" },
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
        quota: { cpu: 1, disk: 7, member: true, boost: true, always_running: true },
        run_limit: 3,
        id: "3f5ea6cb-d334-4dfe-a43f-2072073c2b15",
      },
    };

    const q = quota({}, {}, site_licenses);

    expect(q).toEqual({
      always_running: false,
      cpu_limit: 1,
      cpu_request: 0.05,
      disk_quota: 3000, // default
      idle_timeout: 7200, // both selected licenses are medium
      member_host: true,
      memory_limit: 6000, // both medium from above
      memory_request: 300,
      network: true,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
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
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: false,
      memory_limit: 1000,
      memory_request: 200,
      network: false,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("rejects a incompatible boost license (member hosting)", () => {
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
      disk_quota: 3000,
      idle_timeout: 1800,
      member_host: true,
      memory_limit: 1500,
      memory_request: 300,
      network: true,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });

  it("rejects a incompatible boost license (idle timeout)", () => {
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
      disk_quota: 3000,
      idle_timeout: 7200,
      member_host: true,
      memory_limit: 2000,
      memory_request: 300,
      network: true,
      privileged: false,
      dedicated_disks: [],
      dedicated_vm: false,
    });
  });
});
