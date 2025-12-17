/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import type { Dayjs } from "dayjs";

import type { RegistrationTokenCustomize } from "@cocalc/util/types/registration-token";

export interface Token {
  key?: string; // used in the table, not for the database
  token: string;
  disabled?: boolean;
  active?: boolean;
  descr?: string;
  expires?: Dayjs;
  limit?: number;
  counter?: number;
  ephemeral?: number;
  customize?: RegistrationTokenCustomize;
}

export const HOUR_MS = 60 * 60 * 1000;

export const EPHEMERAL_PRESETS = [
  { key: "6h", label: "6 hours", value: 6 * HOUR_MS },
  { key: "1d", label: "1 day", value: 24 * HOUR_MS },
  { key: "1w", label: "1 week", value: 7 * 24 * HOUR_MS },
] as const;

export const CUSTOM_PRESET_KEY = "custom";

export function msToHours(value?: number): number | undefined {
  if (value == null) return undefined;
  return value / HOUR_MS;
}

export function findPresetKey(value?: number): string | undefined {
  if (value == null) return undefined;
  return EPHEMERAL_PRESETS.find((preset) => preset.value === value)?.key;
}
