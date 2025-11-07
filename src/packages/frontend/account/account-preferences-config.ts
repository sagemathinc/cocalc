/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Shared configuration for account menu items and preferences sub-tabs
 * Used by both account-page.tsx and hotkey quick navigation
 */

export interface AccountMenuItem {
  id: string; // Menu item ID (e.g., "subscriptions", "preferences-appearance")
  key: string; // Tree node key (e.g., "account-subscriptions")
  label: string; // Display name
  icon?: string; // Icon name (or undefined for special components like AIAvatar)
  useAIAvatar?: boolean; // Special case for AI preferences
  isPreferencesSubTab?: boolean; // True if this is a sub-tab under Preferences
}

/**
 * Preferences sub-tabs (nested under "Preferences")
 */
export const PREFERENCES_SUB_TABS: AccountMenuItem[] = [
  {
    id: "preferences-appearance",
    key: "account-preferences-appearance",
    label: "Appearance",
    icon: "eye",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-editor",
    key: "account-preferences-editor",
    label: "Editor",
    icon: "edit",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-keyboard",
    key: "account-preferences-keyboard",
    label: "Keyboard",
    icon: "keyboard",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-ai",
    key: "account-preferences-ai",
    label: "AI",
    useAIAvatar: true,
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-communication",
    key: "account-preferences-communication",
    label: "Communication",
    icon: "comments",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-keys",
    key: "account-preferences-keys",
    label: "SSH and API Keys",
    icon: "key",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-other",
    key: "account-preferences-other",
    label: "Other",
    icon: "sliders",
    isPreferencesSubTab: true,
  },
];

/**
 * Main account menu items (top-level, excluding preferences which are nested)
 */
export const ACCOUNT_MAIN_MENU_ITEMS: AccountMenuItem[] = [
  {
    id: "index",
    key: "account-index",
    label: "Settings",
    icon: "settings",
  },
  {
    id: "profile",
    key: "account-profile",
    label: "Profile",
    icon: "user",
  },
  // Preferences is handled separately as it has sub-items
  {
    id: "subscriptions",
    key: "account-subscriptions",
    label: "Subscriptions",
    icon: "calendar",
  },
  {
    id: "licenses",
    key: "account-licenses",
    label: "Licenses",
    icon: "key",
  },
  {
    id: "payg",
    key: "account-payg",
    label: "Pay as you Go",
    icon: "line-chart",
  },
  {
    id: "upgrades",
    key: "account-upgrades",
    label: "Upgrades",
    icon: "arrow-circle-up",
  },
  {
    id: "purchases",
    key: "account-purchases",
    label: "Purchases",
    icon: "money-check",
  },
  {
    id: "payments",
    key: "account-payments",
    label: "Payments",
    icon: "credit-card",
  },
  {
    id: "payment-methods",
    key: "account-payment-methods",
    label: "Payment Methods",
    icon: "credit-card",
  },
  {
    id: "statements",
    key: "account-statements",
    label: "Statements",
    icon: "calendar-week",
  },
  {
    id: "cloud-filesystems",
    key: "account-cloud-filesystems",
    label: "Cloud Filesystems",
    icon: "cloud",
  },
  {
    id: "public-paths",
    key: "account-public-paths",
    label: "Public Paths",
    icon: "share-square",
  },
  {
    id: "support",
    key: "account-support",
    label: "Support",
    icon: "question-circle",
  },
];
