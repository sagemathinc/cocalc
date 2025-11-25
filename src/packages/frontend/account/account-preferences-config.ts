/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Shared configuration for account menu items and preferences sub-tabs
 * Used by both account-page.tsx and hotkey quick navigation
 */

import type { IntlMessage } from "@cocalc/frontend/i18n";

import { labels } from "@cocalc/frontend/i18n";

export interface AccountMenuItem {
  id: string; // Menu item ID (e.g., "subscriptions", "preferences-appearance")
  key: string; // Tree node key (e.g., "account-subscriptions")
  label: IntlMessage; // IntlMessage for display name
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
    label: labels.appearance,
    icon: "eye",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-editor",
    key: "account-preferences-editor",
    label: labels.editor,
    icon: "edit",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-keyboard",
    key: "account-preferences-keyboard",
    label: labels.keyboard,
    icon: "keyboard",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-ai",
    key: "account-preferences-ai",
    label: labels.ai,
    useAIAvatar: true,
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-communication",
    key: "account-preferences-communication",
    label: labels.communication,
    icon: "comments",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-keys",
    key: "account-preferences-keys",
    label: labels.ssh_and_api_keys,
    icon: "key",
    isPreferencesSubTab: true,
  },
  {
    id: "preferences-other",
    key: "account-preferences-other",
    label: labels.other,
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
    label: labels.settings,
    icon: "settings",
  },
  {
    id: "profile",
    key: "account-profile",
    label: labels.profile,
    icon: "user",
  },
  // Preferences is handled separately as it has sub-items
  {
    id: "subscriptions",
    key: "account-subscriptions",
    label: labels.subscriptions,
    icon: "calendar",
  },
  {
    id: "licenses",
    key: "account-licenses",
    label: labels.licenses,
    icon: "key",
  },
  {
    id: "payg",
    key: "account-payg",
    label: labels.pay_as_you_go,
    icon: "line-chart",
  },
  {
    id: "upgrades",
    key: "account-upgrades",
    label: labels.upgrades,
    icon: "arrow-circle-up",
  },
  {
    id: "purchases",
    key: "account-purchases",
    label: labels.purchases,
    icon: "money-check",
  },
  {
    id: "payments",
    key: "account-payments",
    label: labels.payments,
    icon: "credit-card",
  },
  {
    id: "payment-methods",
    key: "account-payment-methods",
    label: labels.payment_methods,
    icon: "credit-card",
  },
  {
    id: "statements",
    key: "account-statements",
    label: labels.statements,
    icon: "calendar-week",
  },
  {
    id: "cloud-filesystems",
    key: "account-cloud-filesystems",
    label: labels.cloud_file_system,
    icon: "cloud",
  },
  {
    id: "public-paths",
    key: "account-public-paths",
    label: labels.public_paths,
    icon: "share-square",
  },
  {
    id: "support",
    key: "account-support",
    label: labels.support,
    icon: "question-circle",
  },
];
