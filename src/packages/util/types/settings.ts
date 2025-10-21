/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Settings and preferences type definitions shared across packages.
 * These are used by both frontend and backend (e.g., in next.js pages).
 */

// Preferences sub-tab types
export const VALID_PREFERENCES_SUB_TYPES = [
  "appearance",
  "editor",
  "keyboard",
  "ai",
  "communication",
  "keys",
  "other",
] as const;

export type PreferencesSubTabType =
  (typeof VALID_PREFERENCES_SUB_TYPES)[number];

export type PreferencesSubTabKey = `preferences-${PreferencesSubTabType}`;

// Valid settings page types (excluding preferences which are handled separately)
export const VALID_SETTINGS_PAGES = [
  "index",
  "profile",
  "subscriptions",
  "licenses",
  "payg",
  "purchases",
  "payments",
  "statements",
  "public-files",
  "cloud-filesystems",
  "support",
] as const;

export type SettingsPageType = (typeof VALID_SETTINGS_PAGES)[number];

// Navigation path type combining all valid paths
export type NavigatePath =
  | `settings/${SettingsPageType}`
  | `settings/preferences/${PreferencesSubTabType}`;
