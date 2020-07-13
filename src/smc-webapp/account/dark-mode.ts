/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { throttle, isEqual } from "lodash";
import { enable, disable } from "darkreader";
import { AccountStore } from "./store";

export const dark_mode_mins = {
  brightness: 20,
  contrast: 20,
  sepia: 0,
  grayscale: 0,
} as const;

interface Config {
  brightness: number;
  contrast: number;
  sepia: number;
  grayscale: number;
}

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

export function get_dark_mode_config(other_settings): Config {
  const brightness = Math.max(
    dark_mode_mins.brightness,
    to_number(other_settings.get("dark_mode_brightness"), 100)
  );
  const contrast = Math.max(
    dark_mode_mins.contrast,
    to_number(other_settings.get("dark_mode_contrast"), 90)
  );
  const sepia = to_number(other_settings.get("dark_mode_sepia"), dark_mode_mins.sepia);
  const grayscale = to_number(other_settings.get("dark_mode_grayscale"), dark_mode_mins.grayscale);
  return { brightness, contrast, sepia, grayscale };
}

let last_dark_mode: boolean | undefined = undefined;
let last_config: Config | undefined = undefined;
export function init_dark_mode(account_store: AccountStore): void {
  account_store.on(
    "change",
    throttle(() => {
      const dark_mode = account_store.getIn(["other_settings", "dark_mode"]);
      const config = get_dark_mode_config(account_store.get("other_settings"));
      if (dark_mode === last_dark_mode && isEqual(last_config, config)) return;
      last_dark_mode = dark_mode;
      last_config = config;
      if (dark_mode) {
        enable(config);
      } else {
        disable();
      }
    }, 3000)
  );
}
