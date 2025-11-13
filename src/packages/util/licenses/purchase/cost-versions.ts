// We hard code the prices for licenses (and all versions of them) because they must
// remain with the system forever, since we always want to be able to easily compute
// the value of any existing licenses.  For pay-as-you-go, on the other hand, the charges
// are always short live and ephemeral, and the parameters for them are in the database.

// OBVIOUSLY: NEVER EVER CHANGE the existing parameters that define the value of
// a specific released version of a license!  If you make any change, then you must assign a
// new version number and also keep the old version around!!!!

const COST = {
  1: {
    // Subscription discount
    SUB_DISCOUNT: { no: 1, monthly: 0.9, yearly: 0.85 },
    // See https://cloud.google.com/compute/vm-instance-pricing#e2_custommachinetypepricing
    // for the monthly GCE prices
    GCE_COSTS: {
      ram: 0.67, // for pre-emptibles
      cpu: 5, // for pre-emptibles
      disk: 0.04, // per GB/month
      non_pre_factor: 3.5, // Roughly Google's factor for non-preemptible's
    },

    // Our price = GCE price times this.  We charge LESS than Google VM's, due to our gamble
    // on having multiple users on a node at once.
    // 2022-06: price increase "version 2", from 0.75 → 0.8 to compensate for 15% higher GCE prices
    //          and there is also a minimum of 3gb storage (the free base quota) now.
    COST_MULTIPLIER: 0.8,
    // We gamble that projects are packed at least twice as densely on non-member
    // nodes (it's often worse).
    NONMEMBER_DENSITY: 2,
    // Changing this doesn't change the actual academic prices --
    // it just changes the *business* prices.
    ACADEMIC_DISCOUNT: 0.6,
    // Disk factor is based on how many copies of user data we have, plus guesses about
    // bandwidth to transfer data around (to/from cloud storage, backblaze, etc.).
    // 10 since we have about that many copies of user data, plus snapshots, and
    // we store their data long after they stop paying...
    DISK_FACTOR: 10,

    // These are based on what we observe in practice, what works well,
    // and what is configured in our backend autoscalers.  This only
    // impacts the cost of dedicated cpu and RAM.
    RAM_OVERCOMMIT: 5,
    CPU_OVERCOMMIT: 10,

    // Extra charge if project will always be on. Really we are gambling that
    // projects that are not always on, are off much of the time (at least 50%).
    // We use this factor since a 50-simultaneous active projects license could
    // easily be used about half of the time during a week in a large class.
    ALWAYS_RUNNING_FACTOR: 2,
  },

  2: {
    SUB_DISCOUNT: { no: 1, monthly: 0.85, yearly: 0.75 },
    GCE_COSTS: {
      ram: 0.7,
      cpu: 5,
      disk: 0.1,
      non_pre_factor: 3.5,
    },
    COST_MULTIPLIER: 0.9,
    NONMEMBER_DENSITY: 2,
    ACADEMIC_DISCOUNT: 0.6,
    DISK_FACTOR: 10,
    RAM_OVERCOMMIT: 5,
    CPU_OVERCOMMIT: 10,
    ALWAYS_RUNNING_FACTOR: 2,
  },

  3: {
    SUB_DISCOUNT: { no: 1, monthly: 0.9, yearly: 0.75 },
    GCE_COSTS: {
      ram: 0.625, // for pre-emptibles
      cpu: 5, // for pre-emptibles
      disk: 0.04, // per GB/month
      non_pre_factor: 3.5, // Roughly Google's factor for non-preemptible's
    },
    // 2025-08: Andrey increases it to 1
    COST_MULTIPLIER: 1,
    NONMEMBER_DENSITY: 2,
    ACADEMIC_DISCOUNT: 0.6,
    // 2025-08: in anticipation of new file storage
    DISK_FACTOR: 6.25,
    RAM_OVERCOMMIT: 5,
    CPU_OVERCOMMIT: 10,
    ALWAYS_RUNNING_FACTOR: 2,
  },

  // this version is PURELY for testing purposes
  test_1: {
    SUB_DISCOUNT: { no: 1, monthly: 0.9, yearly: 0.85 },
    GCE_COSTS: {
      ram: 0.67,
      cpu: 5,
      disk: 0.04,
      non_pre_factor: 3.5,
    },
    COST_MULTIPLIER: 1.6, // double version 1
    NONMEMBER_DENSITY: 2,
    ACADEMIC_DISCOUNT: 0.6,
    DISK_FACTOR: 10,
    RAM_OVERCOMMIT: 5,
    CPU_OVERCOMMIT: 10,
    ALWAYS_RUNNING_FACTOR: 2,
  },
} as const;

export default COST;
