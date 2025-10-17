/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { EditorSettings } from "./editor-settings/editor-settings";

// Icon constant for account preferences section
export const EDITOR_ICON_NAME: IconName = "edit";

export function AccountPreferencesEditor() {
  return <EditorSettings />;
}
