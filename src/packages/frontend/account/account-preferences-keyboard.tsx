/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { KeyboardSettings } from "./keyboard-settings";

// Icon constant for account preferences section
export const KEYBOARD_ICON_NAME: IconName = "keyboard";

export function AccountPreferencesKeyboard() {
  return (
    <div role="region" aria-label="Keyboard settings">
      <KeyboardSettings />
    </div>
  );
}
