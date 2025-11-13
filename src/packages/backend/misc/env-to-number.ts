/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getLogger from "../logger";

const L = getLogger("env-to-number").debug;

// parse environment variable and convert to integer, with fallback if number could not be parsed
export function envToInt(name: string, fallback: number) {
  const value = process.env[name];
  if (value == null) {
    // L(`envToInt: using fallback value ${fallback} for ${name}`);
    return fallback;
  }
  const parsed = parseInt(value);
  if (isNaN(parsed)) {
    L(
      `envToInt: could not parse ${name}=${value}, using fallback value ${fallback}`
    );
    return fallback;
  }
  return parsed;
}

// parse environment variable and convert to float, with fallback if number could not be parsed
export function envToFloat(name: string, fallback: number) {
  const value = process.env[name];
  if (value == null) {
    L(`envToFloat: using fallback value ${fallback} for ${name}`);
    return fallback;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    L(
      `envToFloat: could not parse ${name}=${value}, using fallback value ${fallback}`
    );
    return fallback;
  }
  return parsed;
}
