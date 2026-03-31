/*
 * Centralized color constants for the chat UI.
 *
 * All chat-specific colors should be defined here so they can be
 * updated in one place.
 */

// Viewer's own messages (blue bubble)
export const VIEWER_BG = "#46b1f6";
export const VIEWER_COLOR = "#fff";
export const VIEWER_DARKER_BG = "#3a9de0"; // for nested elements like history
export const VIEWER_SECONDARY = "rgba(255,255,255,0.85)";

// Other users' messages (gray bubble)
export const OTHER_BG = "#f8f8f8";
export const OTHER_COLOR = "#000";
export const OTHER_SECONDARY = "#888";

// Shared UI colors used across chat components
export const CHAT_SECONDARY_TEXT = "#888"; // sender names, timestamps, muted text
export const CHAT_BUTTON_TEXT = "#555"; // buttons in other users' messages
export const CHAT_COMPOSING_TEXT = "#666";
export const CHAT_SELECTED_BORDER = "#66bb6a";
export const CHAT_ERROR_RED = "#b71c1c";
