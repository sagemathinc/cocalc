/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**

pnpm test hook.test.ts

 * This tests the core of ./hook.ts
 * It's not using it directly, though, because of the complex dependency of the database.
 * The main purpose of this test is to simulate what happens, if first a partial set of licenses,
 * and then one more license is fed through the quota function.
 * There was a bug, where licenses were modified in place, and the second call to the quota function
 * used the modified license, which led to very subtle but severe problems.
 *
 * The quota function uses a deep copy operation on all its arguments to avoid this.
 */

// see packages/database/pool/pool.ts for where this name is also hard coded:
process.env.PGDATABASE = "smc_ephemeral_testing_database";

import { isEqual } from "lodash";

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { quota_with_reasons, SiteLicenses } from "@cocalc/util/upgrades/quota";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await testCleanup(db());
});

test("allow for much larger max_upgrades", () => {
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

  const site_licenses: SiteLicenses = {
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
    { a: site_licenses.a },
    site_settings,
  );
  expect(q1).toEqual({
    quota: {
      network: true,
      member_host: false,
      privileged: false,
      gpu: false,
      memory_request: 1000,
      cpu_request: 0.1,
      disk_quota: 3000,
      memory_limit: 13000,
      cpu_limit: 2,
      idle_timeout: 1800,
      always_running: false,
      dedicated_vm: false,
      dedicated_disks: [],
    },
    reasons: {},
  });

  const q2 = quota_with_reasons(
    {},
    { userX: {} },
    site_licenses,
    site_settings,
  );
  expect(q2).toEqual({
    quota: {
      always_running: false,
      cpu_limit: 5,
      cpu_request: 0.25,
      dedicated_disks: [],
      dedicated_vm: false,
      disk_quota: 3000,
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

test("two licenses", () => {
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

  const site_licenses = {
    a: {
      quota: { cpu: 1, ram: 13 },
    },
    b: {
      quota: { cpu: 3, ram: 32 },
    },
  };

  const q1 = quota_with_reasons(
    {},
    { userX: {} },
    { a: site_licenses.a },
    site_settings,
  );
  expect(q1).toEqual({
    quota: {
      network: true,
      member_host: false,
      privileged: false,
      gpu: false,
      memory_request: 1000,
      cpu_request: 0.05,
      disk_quota: 3000,
      memory_limit: 13000,
      cpu_limit: 1,
      idle_timeout: 1800,
      always_running: false,
      dedicated_vm: false,
      dedicated_disks: [],
    },
    reasons: {},
  });

  const q2 = quota_with_reasons(
    {},
    { userX: {} },
    site_licenses,
    site_settings,
  );
  expect(q1).toEqual({
    quota: {
      network: true,
      member_host: false,
      privileged: false,
      gpu: false,
      memory_request: 1000,
      cpu_request: 0.05,
      disk_quota: 3000,
      memory_limit: 13000,
      cpu_limit: 1,
      idle_timeout: 1800,
      always_running: false,
      dedicated_vm: false,
      dedicated_disks: [],
    },
    reasons: {},
  });

  expect(q2).toEqual({
    quota: {
      always_running: false,
      cpu_limit: 4,
      cpu_request: 0.2,
      dedicated_disks: [],
      dedicated_vm: false,
      disk_quota: 3000,
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

  // in particular, this implies that the second license indeed HAS an effect and hence will be used.
  expect(isEqual(q1, q2)).toBe(false);
});

// TODO the test below would be very important to get to work, but the call to the site_license_hook has no effect at all

// describe("site_license_hook", () => {
//   const pool = getPool();
//   const account_id = uuid();
//   const license_id_1 = uuid();
//   const license_id_2 = uuid();

//   let project_id;
//   test("creates a project", async () => {
//     project_id = await createProject({
//       account_id,
//       title: "Test Project",
//     });
//   });

//   test("setup project license", async () => {
//     const site_licenses_data: SiteLicenses = {
//       [license_id_1]: {
//         quota: {
//           dedicated_disk: { speed: "standard", size_gb: 128, name: "bar" },
//         },
//       },
//       [license_id_2]: {
//         quota: {
//           ram: 2,
//           cpu: 1,
//           disk: 3,
//           always_running: true,
//           member: true,
//           user: "academic",
//         },
//       },
//     };

//     await pool.query(
//       "UPDATE projects SET site_license=$1 WHERE project_id=$2",
//       [site_licenses_data, project_id]
//     );
//   });

//   test("PAYGO mixes with dedicated disk", async () => {
//     // run the hook -- "true" means there are PAYGO upgrades, different mode of how the license hook operates
//     await site_license_hook(db(), project_id, true);

//     const { rows } = await pool.query(
//       "SELECT * FROM projects WHERE project_id=$1",
//       [project_id]
//     );
//     expect(rows.length).toBe(1);
//     const site_licenses = rows[0].site_license;
//     expect(rows[0].site_license).toEqual({
//       [license_id_1]: {
//         quota: {
//           dedicated_disk: { name: "bar", size_gb: 128, speed: "standard" },
//         },
//       },
//       [license_id_2]: {
//         quota: {
//           always_running: true,
//           cpu: 1,
//           disk: 3,
//           member: true,
//           ram: 2,
//           user: "academic",
//         },
//       },
//     });

//     const q = quota_with_reasons({}, { [account_id]: {} }, site_licenses);
//     // projects on dedicated VMs get this quota
//     expect(q).toEqual({
//       quota: {
//         always_running: false,
//         cpu_limit: 1,
//         cpu_request: 0.02,
//         dedicated_disks: [
//           {
//             name: "bar",
//             size_gb: 128,
//             speed: "standard",
//           },
//         ],
//         dedicated_vm: false,
//         disk_quota: 3000,
//         idle_timeout: 1800,
//         member_host: false,
//         memory_limit: 1000,
//         memory_request: 200,
//         network: false,
//            privileged: false,gpu:false,
//       },
//       reasons: {},
//     });
//   });
// });
