/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/**
 * This tests the core of ./hook.ts
 * It's not using it directly, though, because of the complex dependency of the database.
 * The main purpose of this test is to simulate what happens, if first a partial set of licenses,
 * and then one more license is fed through the quota function.
 * There was a bug, where licenses were modified in place, and the second call to the quota function
 * used the modified license, which led to very subtle but severe problems.
 *
 * The quota function uses a deep copy operation on all its arguments to avoid this.
 */

import { isEqual } from "lodash";

import { quota_with_reasons } from "@cocalc/util/upgrades/quota";

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
      gpu: false,
      ephemeral_state: 1,
      ephemeral_disk: 1,
      always_running: 1,
    },
    kucalc: "onprem",
    datastore: true,
  };

  const site_licenses = {
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
    site_settings
  );
  expect(q1).toEqual({
    quota: {
      network: true,
      member_host: false,
      privileged: false,
      memory_request: 1000,
      cpu_request: 0.1,
      disk_quota: 3000,
      memory_limit: 13000,
      cpu_limit: 2,
      idle_timeout: 1800,
      gpu: false,
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
    site_settings
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
      gpu: false,
      memory_request: 1000,
      network: true,
      privileged: false,
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
    site_settings
  );
  expect(q1).toEqual({
    quota: {
      network: true,
      member_host: false,
      privileged: false,
      memory_request: 1000,
      cpu_request: 0.05,
      disk_quota: 3000,
      memory_limit: 13000,
      gpu: false,
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
    site_settings
  );
  expect(q1).toEqual({
    quota: {
      network: true,
      member_host: false,
      privileged: false,
      memory_request: 1000,
      cpu_request: 0.05,
      disk_quota: 3000,
      memory_limit: 13000,
      cpu_limit: 1,
      gpu: false,
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
      gpu: false,
      memory_limit: 45000,
      memory_request: 1000,
      network: true,
      privileged: false,
    },
    reasons: {},
  });

  // in particular, this implies that the second license indeed HAS an effect and hence will be used.
  expect(isEqual(q1, q2)).toBe(false);
});
