import { create } from "./types";

// Kucalc's Dedicated VMs -- not exposed to users

export const dedicated_vms = create({
  rules: {
    desc: "Dedicated Virtual Machines (kucalc only)",
    primary_key: "id"
  },
  fields: {
    id: {
      type: "string",
      desc: "short unique identifier, lowercase [a-z0-9]+"
    },
    spec: {
      type: "map",
      desc:
        "specification: cluster specific shorthand like {'spec':'n1-standard-4'} or {'cores': 10, 'memory': 16} (mem in GB)"
    },
    preempt: {
      type: "boolean",
      desc:
        "if true, select preemptible type (or a similar low-class hosting to reduce costs). default: false"
    },
    amount: {
      type: "integer",
      desc: "number of nodes. default: 1"
    }
  }
});

export const dedicated_projects = create({
  rules: {
    desc: "Configuration for projects running on Dedicated VMs (kucalc only)",
    primary_key: "id"
  },
  fields: {
    id: {
      type: "string",
      desc: "short unique identifier, lowercase [a-z0-9]+"
    }
  }
});
