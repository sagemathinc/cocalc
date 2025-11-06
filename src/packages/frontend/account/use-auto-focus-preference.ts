/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";

/**
 * Hook to get the user's auto focus preference for text input fields.
 * Returns false by default (auto focus disabled).
 */
export function useAutoFocusPreference(): boolean {
  const other_settings = useTypedRedux("account", "other_settings");
  return other_settings?.get("auto_focus") ?? false;
}
