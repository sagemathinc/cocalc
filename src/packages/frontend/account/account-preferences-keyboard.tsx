/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { KeyboardSettings } from "./keyboard-settings";

// Icon constant for account preferences section
export const KEYBOARD_ICON_NAME = "keyboard";

export function AccountPreferencesKeyboard() {
  return <KeyboardSettings />;
}
