/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// IMPORTANT: If you change this file, also update this date, which appears in webapp-lib/policies/pricing.pug

exports.CURRENT_DATE = "August 2019";

// Define upgrades to projects.
//
// NOTE: Technically upgrades.subscription should be called upgrades.plans, to better
// corresponding to what stripe does...

// NOTE: This script ./upgrade-spec.coffee is copied into the Docker container
// in k8s/smc-project/manager/, so if you move or rename this script, you must
// also update that.

const upgrades = (exports.upgrades = {});

// these are the base quotas
exports.DEFAULT_QUOTAS = {
  disk_quota: 3000,
  cores: 1,
  cpu_shares: 0,
  memory: 1000,
  memory_request: 0,
  mintime: 1800, // 30 minutes
  network: 0,
  member_host: 0,
  ephemeral_state: 0,
  ephemeral_disk: 0,
  always_running: 0,
};

upgrades.max_per_project = {
  disk_quota: 20000,
  memory: 16000,
  memory_request: 8000,
  cores: 3,
  network: 1,
  cpu_shares: 1024 * 2,
  mintime: 24 * 3600 * 90,
  member_host: 1,
  ephemeral_state: 1,
  ephemeral_disk: 1,
  always_running: 1,
};

// this is only for on-prem kubernetes setups
exports.ON_PREM_DEFAULT_QUOTAS = {
  internet: true,
  idle_timeout: 60 * 60, // 1 hour
  mem: 1000,
  cpu: 1,
  cpu_oc: 10, // overcommitment ratio 10:1
  mem_oc: 5, // overcommitment ratio 5:1
};

// In the params listed below you *MUST* define all of display, display_unit,
// display_factor, pricing_unit, pricing_factor, input_type, and desc!   This
// is assumed elsewhere.
upgrades.params = {
  disk_quota: {
    display: "Disk space",
    unit: "MB",
    display_unit: "MB",
    display_factor: 1,
    pricing_unit: "GB",
    pricing_factor: 1 / 1000,
    input_type: "number",
    desc: "The maximum amount of disk space (in MB) that a project may use.",
  },
  memory: {
    display: "Shared RAM",
    unit: "MB",
    display_unit: "MB",
    display_factor: 1,
    pricing_unit: "GB",
    pricing_factor: 1 / 1000,
    input_type: "number",
    desc:
      "Upper bound on RAM that all processes in a project may use in total (shared with other projects; not guaranteed).",
  },
  memory_request: {
    display: "Dedicated RAM",
    unit: "MB",
    display_unit: "MB",
    display_factor: 1,
    pricing_unit: "GB",
    pricing_factor: 1 / 1000,
    input_type: "number",
    desc: "Guaranteed minimum amount of RAM that is dedicated to your project.",
  },
  cores: {
    display: "Shared CPU",
    unit: "core",
    display_unit: "core",
    display_factor: 1,
    pricing_unit: "core",
    pricing_factor: 1,
    input_type: "number",
    desc:
      "Upper bound on the number of shared CPU cores that your project may use (shared with other projects; not guaranteed).",
  },
  cpu_shares: {
    display: "Dedicated CPU",
    unit: "core",
    display_unit: "core",
    display_factor: 1 / 1024,
    pricing_unit: "core",
    pricing_factor: 1 / 1024,
    input_type: "number",
    desc:
      "Guaranteed minimum number of CPU cores that are dedicated to your project.",
  },
  mintime: {
    display: "Idle timeout",
    unit: "second",
    display_unit: "hour",
    display_factor: 1 / 3600, // multiply internal by this to get what should be displayed
    pricing_unit: "day",
    pricing_factor: 1 / 86400,
    input_type: "number",
    desc:
      "If the project is not used for this long, then it will be automatically stopped.",
  },
  network: {
    display: "Internet access",
    unit: "internet upgrade",
    display_unit: "internet upgrade",
    display_factor: 1,
    pricing_unit: "project",
    pricing_factor: 1,
    input_type: "checkbox",
    desc:
      "Full internet access enables a project to connect to the computers outside of CoCalc, download software packages, etc.",
  },
  member_host: {
    display: "Member hosting",
    unit: "hosting upgrade",
    display_unit: "hosting upgrade",
    display_factor: 1,
    pricing_unit: "project",
    pricing_factor: 1,
    input_type: "checkbox",
    desc:
      "Runs this project on a machine hosting less projects, aside from the free projects, and without random reboots.",
  },
  always_running: {
    display: "Always running",
    unit: "always running upgrade",
    display_unit: "always running upgrade",
    display_factor: 1,
    pricing_unit: "project",
    pricing_factor: 1,
    input_type: "checkbox",
    desc:
      "Ensures this project is always running.  If the project stops or crashes for any reason, it is automatically started again.",
  },
  ephemeral_state: {
    display: "Ephemeral state",
    unit: "state",
    display_unit: "state",
    display_factor: 1,
    pricing_unit: "project",
    pricing_factor: 1,
    input_type: "checkbox",
    desc: "",
  },
  ephemeral_disk: {
    display: "Ephemeral disk",
    unit: "disk",
    display_factor: 1,
    pricing_unit: "project",
    pricing_factor: 1,
    input_type: "checkbox",
    desc: "",
  },
};

upgrades.field_order = [
  "member_host",
  "network",
  "always_running",
  "mintime",
  "disk_quota",
  "memory",
  "memory_request",
  "cores",
  "cpu_shares",
];

// live_subscriptions is an array of arrays.  Each array should have length a divisor of 12.
// The subscriptions will be displayed one row at a time.

// Switch to this on the frontend when we go live with the new pricing plans.
upgrades.live_subscriptions = [
  ["standard2", "premium2", "professional2"],
  [
    "xsmall_premium_course",
    "small_premium_course",
    "medium_premium_course",
    "large_premium_course",
  ],
  ["xsmall_course2", "small_course2", "medium_course2", "large_course2"],
  [
    "xsmall_basic_course",
    "small_basic_course",
    "medium_basic_course",
    "large_basic_course",
  ],
];

/* OLD
upgrades.live_subscriptions = [['standard', 'premium', 'professional'],
                               ['xsmall_course2', 'small_course2', 'medium_course2', 'large_course2'],
                               ['xsmall_course',  'small_course', 'medium_course', 'large_course']]
*/

upgrades.dedicated_vms = [
  "dedicated_small",
  "dedicated_medium",
  "dedicated_large",
];

upgrades.period_names = {
  month: "month",
  year: "year",
  month4: "4 months",
  week: "week",
  year1: "year",
};

const subscription = (upgrades.subscription = {});

subscription.professional = {
  // a user that has a professional subscription
  icon: "battery-full",
  desc: "Professional Plan",
  statement: "COCALC PRO",
  price: {
    month: 99,
    year: 999,
  },
  cancel_at_period_end: false,
  benefits: {
    cores: 5,
    cpu_shares: 1024,
    disk_quota: 5000 * 20,
    member_host: 2 * 20,
    memory: 3000 * 20,
    memory_request: 1000 * 4,
    mintime: 24 * 3600 * 20,
    network: 10 * 20,
  },
};

subscription.premium = {
  // a user that has a premium subscription
  icon: "battery-three-quarters",
  desc: "Premium Plan",
  statement: "COCALC PREMIUM",
  price: {
    month: 49,
    year: 499,
  },
  cancel_at_period_end: false,
  benefits: {
    cores: 2,
    cpu_shares: 512,
    disk_quota: 5000 * 8,
    member_host: 2 * 8,
    memory: 3000 * 8,
    memory_request: 1000 * 2,
    mintime: 24 * 3600 * 8,
    network: 10 * 8,
  },
};

subscription.standard = {
  // a user that has a standard subscription
  icon: "battery-quarter",
  desc: "Standard Plan",
  statement: "COCALC STANDARD",
  price: {
    month: 7,
    year: 79,
  },
  cancel_at_period_end: false,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 5000,
    member_host: 2,
    memory: 3000,
    memory_request: 0,
    mintime: 24 * 3600,
    network: 20,
  },
};

subscription.professional2 = {
  // a user that has a professional subscription
  icon: "battery-full",
  desc: "Professional Plan",
  statement: "COCALC PRO",
  price: {
    month: 149,
    year: 1499,
  },
  cancel_at_period_end: false,
  benefits: {
    cores: 4,
    cpu_shares: 2048,
    disk_quota: 5000 * 20,
    member_host: 2 * 20,
    memory: 3000 * 20,
    memory_request: 1000 * 4,
    mintime: 24 * 3600 * 20,
    network: 80,
  },
};

subscription.premium2 = {
  // a user that has a premium subscription
  icon: "battery-three-quarters",
  desc: "Premium Plan",
  statement: "COCALC PREMIUM",
  price: {
    month: 79,
    year: 799,
  },
  cancel_at_period_end: false,
  benefits: {
    cores: 2,
    cpu_shares: 1024,
    disk_quota: 5000 * 8,
    member_host: 2 * 8,
    memory: 3000 * 8,
    memory_request: 1000 * 2,
    mintime: 24 * 3600 * 8,
    network: 32,
  },
};

subscription.standard2 = {
  // a user that has a standard subscription
  icon: "battery-quarter",
  desc: "Standard Plan",
  statement: "COCALC STANDARD",
  price: {
    month: 14,
    year: 149,
  },
  cancel_at_period_end: false,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 8000,
    member_host: 4,
    memory: 4000,
    memory_request: 0,
    mintime: 24 * 3600,
    network: 8,
  },
};

subscription.large_course = {
  icon: "battery-full",
  desc: "Basic Large Course\n(250 people)",
  statement: "COCALC BASIC LG",
  price: {
    week: 199,
    month4: 999,
    year1: 2499,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 250,
    network: 250,
  },
};

subscription.large_course2 = {
  icon: "battery-full",
  desc: "Standard Large Course\n(250 people)",
  statement: "COCALC LG",
  price: {
    week: 399,
    month4: 1999,
    year1: 4999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 250,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 250 * 1000,
    mintime: 25 * 24 * 3600,
    memory_request: 0,
    member_host: 250,
    network: 250,
  },
};

subscription.medium_course = {
  icon: "battery-three-quarters",
  desc: "Basic Medium Course\n(70 people)",
  statement: "COCALC BASIC MD",
  price: {
    week: 79,
    month4: 399,
    year1: 999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 70,
    network: 70,
  },
};

subscription.medium_course2 = {
  icon: "battery-three-quarters",
  desc: "Standard Medium Course\n(70 people)",
  statement: "COCALC MD",
  price: {
    week: 159,
    month4: 799,
    year1: 1999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 70,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 70 * 1000,
    mintime: 7 * 24 * 3600,
    memory_request: 0,
    member_host: 70,
    network: 70,
  },
};

subscription.xsmall_course = {
  icon: "battery-empty",
  desc: "Basic Extra Small Course\n(10 people)",
  statement: "COCALC BASIC XS",
  price: {
    week: 19,
    month4: 99,
    year1: 249,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 10,
    network: 10,
  },
};

subscription.xsmall_course2 = {
  icon: "battery-empty",
  desc: "Standard Extra Small\nCourse (10 people)",
  statement: "COCALC XS",
  price: {
    week: 39,
    month4: 199,
    year1: 499,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 10,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 10 * 1000,
    mintime: 24 * 3600,
    memory_request: 0,
    member_host: 10,
    network: 10,
  },
};

subscription.small_course = {
  icon: "battery-quarter",
  desc: "Basic Small Course\n(25 people)",
  statement: "COCALC BASIC SM",
  price: {
    week: 39,
    month4: 199,
    year1: 499,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 25,
    network: 25,
  },
};

subscription.small_course2 = {
  icon: "battery-quarter",
  desc: "Standard Small Course\n(25 people)",
  statement: "COCALC SM",
  price: {
    week: 79,
    month4: 399,
    year1: 999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 25,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 25 * 1000,
    mintime: 60 * 3600,
    memory_request: 0,
    member_host: 25,
    network: 25,
  },
};

/*
Basic Courses
*/

subscription.xsmall_basic_course = {
  icon: "battery-empty",
  desc: "Basic Extra Small\nCourse (10 people)",
  statement: "COCALC BASIC XS",
  price: {
    week: 29,
    month4: 149,
    year1: 349,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 10,
    network: 10,
  },
};

subscription.small_basic_course = {
  icon: "battery-quarter",
  desc: "Basic Small Course\n(25 people)",
  statement: "COCALC BASIC SM",
  price: {
    week: 59,
    month4: 299,
    year1: 799,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 25,
    network: 25,
  },
};

subscription.medium_basic_course = {
  icon: "battery-three-quarters",
  desc: "Basic Medium Course\n(70 people)",
  statement: "COCALC BASIC MD",
  price: {
    week: 119,
    month4: 599,
    year1: 1499,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 70,
    network: 70,
  },
};

subscription.large_basic_course = {
  icon: "battery-full",
  desc: "Basic Large Course\n(250 people)",
  statement: "COCALC BASIC LG",
  price: {
    week: 299,
    month4: 1499,
    year1: 3499,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 250,
    network: 250,
  },
};

/*
Premium Courses
*/

subscription.xsmall_premium_course = {
  icon: "battery-empty",
  desc: "Premium Extra Small\nCourse (10 people)",
  statement: "COCALC PREMIUM XS",
  price: {
    week: 79,
    month4: 399,
    year1: 999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 10 * 2,
    cpu_shares: 0,
    disk_quota: 10 * 3000,
    mintime: 2 * 24 * 3600,
    memory: 10 * 3 * 1000,
    memory_request: 0,
    member_host: 10,
    network: 10,
  },
};

subscription.small_premium_course = {
  icon: "battery-quarter",
  desc: "Premium Small Course\n(25 people)",
  statement: "COCALC PREMIUM SM",
  price: {
    week: 159,
    month4: 799,
    year1: 1999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 25 * 2,
    cpu_shares: 0,
    disk_quota: 25 * 3000,
    mintime: 5 * 24 * 3600,
    memory: 25 * 3 * 1000,
    memory_request: 0,
    member_host: 25,
    network: 25,
  },
};

subscription.medium_premium_course = {
  icon: "battery-three-quarters",
  desc: "Premium Medium Course\n(70 people)",
  statement: "COCALC PREMIUM MD",
  price: {
    week: 319,
    month4: 1599,
    year1: 3999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 70 * 2,
    cpu_shares: 0,
    disk_quota: 70 * 3000,
    mintime: 14 * 24 * 3600,
    memory: 70 * 3 * 1000,
    memory_request: 0,
    member_host: 70,
    network: 70,
  },
};

subscription.large_premium_course = {
  icon: "battery-full",
  desc: "Premium Large Course\n(250 people)",
  statement: "COCALC PREMIUM LG",
  price: {
    week: 799,
    month4: 3999,
    year1: 9999,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 250 * 2,
    cpu_shares: 0,
    disk_quota: 250 * 3000,
    mintime: 50 * 24 * 3600,
    memory: 3 * 250 * 1000,
    memory_request: 0,
    member_host: 250,
    network: 250,
  },
};

/*
Individual student
*/
subscription.student_course = {
  icon: "graduation-cap",
  statement: "COCALC STUDENT",
  desc: "Student Course",
  price: {
    month4: 14,
  },
  cancel_at_period_end: true,
  benefits: {
    cores: 0,
    cpu_shares: 0,
    disk_quota: 0,
    memory: 0,
    memory_request: 0,
    member_host: 2,
    mintime: 7600,
    network: 2,
  },
};

/*
 Dedicated VMs
 */
subscription.dedicated_small = {
  // n1-standard-4 + 200gb standard disk
  icon: "battery-quarter",
  desc: "Dedicated VM (small)",
  statement: "COCALC VM SMALL",
  price: {
    month: 199,
  },
  cancel_at_period_end: false,
  benefits: {
    cpu_shares: 4 * 1024,
    disk_quota: 1000 * 200,
    memory_request: 1000 * 15,
  },
};

subscription.dedicated_medium = {
  // n1-highmem-8 + 400gb standard disk
  icon: "battery-three-quarters",
  desc: "Dedicated VM (medium)",
  statement: "COCALC VM MEDIUM",
  price: {
    month: 499,
  },
  cancel_at_period_end: false,
  benefits: {
    cpu_shares: 8 * 1024,
    disk_quota: 1000 * 400,
    memory_request: 1000 * 52,
  },
};

subscription.dedicated_large = {
  // n1-highmem-16 + 600gb standard disk
  icon: "battery-full",
  desc: "Dedicated VM (large)",
  statement: "COCALC VM LARGE",
  price: {
    month: 999,
  },
  cancel_at_period_end: false,
  benefits: {
    cpu_shares: 16 * 1024,
    disk_quota: 1000 * 600,
    memory_request: 1000 * 104,
  },
};
