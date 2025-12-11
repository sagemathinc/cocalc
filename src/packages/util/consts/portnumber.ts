/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const PORT_MIN = 1;
export const PORT_MAX = 65535;

export function validatePortNumber(port: unknown): number | undefined {
  if (port == null || port === "") return;
  const value =
    typeof port === "number"
      ? port
      : typeof port === "string"
      ? Number(port)
      : NaN;
  if (!Number.isInteger(value)) return;
  if (value < PORT_MIN || value > PORT_MAX) return;
  return value;
}
