/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Centralized color constants for the chat UI.
 *
 * All chat-specific colors should be defined here so they can be
 * updated in one place.  The defaults now come from the THEME_DEFAULT
 * color theme to stay in sync with the rest of the app.
 */

import { THEME_DEFAULT } from "@cocalc/util/theme";

// Viewer's own messages (blue bubble)
export const VIEWER_BG = THEME_DEFAULT.chatViewerBg;
export const VIEWER_COLOR = THEME_DEFAULT.chatViewerText;
export const VIEWER_DARKER_BG = "#3a9de0"; // for nested elements like history
export const VIEWER_SECONDARY = "rgba(255,255,255,0.85)";

// Other users' messages (gray bubble)
export const OTHER_BG = THEME_DEFAULT.chatOtherBg;
export const OTHER_COLOR = THEME_DEFAULT.chatOtherText;
export const OTHER_SECONDARY = THEME_DEFAULT.textTertiary;

// Shared UI colors used across chat components
export const CHAT_SECONDARY_TEXT = THEME_DEFAULT.textTertiary;
export const CHAT_BUTTON_TEXT = THEME_DEFAULT.textSecondary;
export const CHAT_COMPOSING_TEXT = THEME_DEFAULT.textSecondary;
export const CHAT_SELECTED_BORDER = THEME_DEFAULT.colorSuccess;
export const CHAT_ERROR_RED = THEME_DEFAULT.colorError;
