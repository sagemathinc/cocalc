/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { isEqual, debounce } from "lodash";

import { DARK_MODE_DEFAULTS } from "@cocalc/util/db-schema/accounts";
import { AccountStore } from "./store";

export const DARK_MODE_KEYS = ["brightness", "contrast", "sepia"] as const;

type Config = Record<(typeof DARK_MODE_KEYS)[number], number>;

export const DARK_MODE_MINS: Config = {
  brightness: 30,
  contrast: 30,
  sepia: 0,
} as const;

// Returns number between 0 and 100.
function to_number(x: any, default_value: number): number {
  if (x == null) return default_value;
  try {
    x = parseInt(x);
    if (isNaN(x)) {
      return default_value;
    }
    if (x < 0) {
      x = 0;
    }
    if (x > 100) {
      x = 100;
    }
    return x;
  } catch (_) {
    return default_value;
  }
}

export function get_dark_mode_config(other_settings?: {
  dark_mode_brightness?: number;
  dark_mode_contrast?: number;
  dark_mode_sepia?: number;
}): Config {
  const config = {} as Config;

  for (const key of DARK_MODE_KEYS) {
    config[key] = Math.max(
      DARK_MODE_MINS[key],
      to_number(other_settings?.[`dark_mode_${key}`], DARK_MODE_DEFAULTS[key]),
    );
  }

  return config;
}

let currentDarkMode: boolean = false;
let last_dark_mode: boolean = false;
let last_config: Config | undefined = undefined;

export function init_dark_mode(account_store: AccountStore): void {
  account_store.on(
    "change",
    debounce(
      async () => {
        const dark_mode = !!account_store.getIn([
          "other_settings",
          "dark_mode",
        ]);
        currentDarkMode = dark_mode;
        const config = get_dark_mode_config(
          account_store.get("other_settings")?.toJS(),
        );
        if (
          dark_mode == last_dark_mode &&
          (!dark_mode || isEqual(last_config, config))
        ) {
          return;
        }
        const { enable, disable } = await import("darkreader");
        last_dark_mode = dark_mode;
        last_config = config;
        if (dark_mode) {
          disable();
          enable(config);
        } else {
          disable();
        }
      },
      1000,
      { trailing: true, leading: false },
    ),
  );
}

export function inDarkMode() {
  return currentDarkMode;
}
