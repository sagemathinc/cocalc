/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import dayjs from "dayjs";
import { clamp, isDate } from "lodash";
import { NextRouter } from "next/router";

import { testDedicatedDiskNameBasic } from "@cocalc/util/licenses/check-disk-name-basics";
import { BOOST, REGULAR } from "@cocalc/util/upgrades/consts";
import {
  DEDICATED_DISK_SIZES,
  DEDICATED_DISK_SPEEDS,
  DEFAULT_DEDICATED_DISK_SIZE,
  DEFAULT_DEDICATED_DISK_SPEED,
  DEFAULT_DEDICATED_VM_MACHINE,
  PRICES,
} from "@cocalc/util/upgrades/dedicated";
import type { DateRange } from "@cocalc/util/upgrades/shopping";
import { MAX_ALLOWED_RUN_LIMIT } from "./run-limit";
// Various support functions for storing quota parameters as a query parameter in the browser URL

export function encodeRange(
  vals: [Date | string | undefined, Date | string | undefined],
): string {
  const [start, end] = vals;
  if (start == null || end == null) {
    return "";
  }
  return `${new Date(start).toISOString()}_${new Date(end).toISOString()}`;
}

// the inverse of encodeRange
function decodeRange(val: string): DateRange {
  if (!val) return [undefined, undefined];
  const vals = val.split("_");
  if (vals.length != 2) return [undefined, undefined];
  const w: Date[] = [];
  for (const x of vals) {
    const d = dayjs(x);
    if (d.isValid()) {
      w.push(d.toDate());
    } else {
      return [undefined, undefined];
    }
  }
  return w as DateRange;
}

const COMMON_FIELDS = [
  "user",
  "period",
  "range",
  "title",
  "description",
] as const;

const REGULAR_FIELDS = [
  ...COMMON_FIELDS,
  "run_limit",
  "member",
  "uptime",
  "cpu",
  "ram",
  "disk",
] as const;

const DEDICATED_FIELDS = [
  ...COMMON_FIELDS,
  "disk-size_gb",
  "disk-name",
  "disk-speed",
  "vm-machine",
] as const;

function getFormFields(
  type: "regular" | "boost" | "dedicated",
): readonly string[] {
  switch (type) {
    case "regular":
    case "boost":
      return REGULAR_FIELDS;
    case "dedicated":
      return DEDICATED_FIELDS;
  }
}

export const ALL_FIELDS: Set<string> = new Set(
  REGULAR_FIELDS.concat(DEDICATED_FIELDS as any).concat([
    "type",
    "source",
  ] as any),
);

// Global flag to prevent URL encoding during initial page load
let allowUrlEncoding = false;

export function setAllowUrlEncoding(allow: boolean) {
  allowUrlEncoding = allow;
}

export function encodeFormValues(
  router: NextRouter,
  vals: any,
  type: "regular" | "boost" | "dedicated",
): void {
  if (!allowUrlEncoding) {
    return;
  }
  const { query } = router;
  for (const key in vals) {
    if (!getFormFields(type).includes(key)) continue;
    const val = vals[key];
    if (val == null) {
      delete query[key];
    } else if (key === "range") {
      query[key] = encodeRange(val);
    } else {
      query[key] = val;
    }
  }
  router.replace({ query }, undefined, { shallow: true, scroll: false });
}

function decodeValue(val): boolean | number | string | DateRange {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
}

function fixNumVal(
  val: any,
  param: { min: number; max: number; dflt: number },
): number {
  if (typeof val !== "number") {
    return param.dflt;
  } else {
    return clamp(val, param.min, param.max);
  }
}

/** a query looks like this:
 * user=academic&period=monthly&run_limit=1&member=true&uptime=short&cpu=1&ram=2&disk=3
 *
 * NOTE: the support for dedicated disk & vm does not work. the form is too complicated, not no need to support this yet.
 */
export function decodeFormValues(
  router: NextRouter,
  type: "regular" | "boost" | "dedicated",
): {
  [key: string]: string | number | boolean;
} {
  const P = type === "boost" ? BOOST : REGULAR;
  const fields: readonly string[] = getFormFields(type);

  const data = {};
  for (const key in router.query) {
    const val = router.query[key];
    if (!fields.includes(key)) {
      continue;
    }
    if (typeof val !== "string") {
      // Handle non-string values by converting them to string first
      const stringVal = String(val);
      const decoded =
        key === "range" ? decodeRange(stringVal) : decodeValue(stringVal);
      data[key] = decoded;
      continue;
    }
    const decoded = key === "range" ? decodeRange(val) : decodeValue(val);
    data[key] = decoded;
  }

  // we also have to sanitize the values
  for (const key in data) {
    const val = data[key];
    switch (key) {
      case "user":
        if (!["academic", "business"].includes(val)) {
          data[key] = "academic";
        }
        break;

      case "period":
        if (!["monthly", "yearly", "range"].includes(val)) {
          data[key] = "monthly";
        }
        break;

      case "range":
        // check that val is an array of length 2 and both entries are Date objects
        if (!Array.isArray(val) || val.length !== 2 || !val.every(isDate)) {
          data[key] = [undefined, undefined];
        }
        break;

      case "run_limit":
        // check that val is a number and in the range of 1 to 1000
        if (typeof val !== "number" || val < 1 || val > MAX_ALLOWED_RUN_LIMIT) {
          data[key] = 1;
        }
        break;

      case "member":
        if (typeof val !== "boolean") {
          data[key] = true;
        }
        break;

      case "uptime":
        if (!["short", "medium", "day", "always_running"].includes(val)) {
          data[key] = "short";
        }
        break;

      case "cpu":
        data[key] = fixNumVal(val, P.cpu);
        break;

      case "ram":
        data[key] = fixNumVal(val, P.ram);
        break;

      case "disk":
        data[key] = fixNumVal(val, P.disk);
        break;

      case "disk-size_gb":
        if (typeof val !== "number" || !DEDICATED_DISK_SIZES.includes(val)) {
          data[key] = DEFAULT_DEDICATED_DISK_SIZE;
        }
        break;

      case "disk-name":
        try {
          testDedicatedDiskNameBasic(val);
        } catch {
          data[key] = "";
        }
        break;

      case "disk-speed":
        if (!DEDICATED_DISK_SPEEDS.includes(val)) {
          data[key] = DEFAULT_DEDICATED_DISK_SPEED;
        }
        break;

      case "vm-machine":
        if (PRICES.vms[val] == null) {
          data[key] = DEFAULT_DEDICATED_VM_MACHINE;
        }
        break;

      case "title":
      case "description":
        data[key] = val;
        break;

      default:
        console.log(`decodingFormValues: unknown key '${key}'`);
        delete data[key];
    }
  }

  // hosting quality vs. uptime restriction:
  if (["always_running", "day"].includes(data["uptime"])) {
    data["member"] = true;
  }

  if (type === "dedicated") {
    data["type"] = data["vm-machine"] != null ? "vm" : null;

    // if any key in data starts with "disk-" then set data["type"] to "disk"
    if (data["type"] == null) {
      for (const key in data) {
        if (key.startsWith("disk-")) {
          data["type"] = "disk";
          break;
        }
      }
    }

    if (data["type"] === "disk") {
      data["period"] = "monthly";
    }
    if (data["type"] === "vm") {
      data["period"] = "range";
    }
  }

  return data;
}
