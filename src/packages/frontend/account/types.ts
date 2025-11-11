/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore userdefined

import { List, Map } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import type { Locale, OTHER_SETTINGS_LOCALE_KEY } from "@cocalc/frontend/i18n";
import type { Hotkey } from "./hotkey-selector";
import { type AutoBalance } from "@cocalc/util/db-schema/accounts";
import {
  NEW_FILENAMES,
  NewFilenameTypes,
  OTHER_SETTINGS_USERDEFINED_LLM,
} from "@cocalc/util/db-schema/defaults";
import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { OTHER_SETTINGS_REPLY_ENGLISH_KEY } from "@cocalc/util/i18n/const";
import { PassportStrategyFrontend } from "@cocalc/util/types/passport-types";
import { type PreferencesSubTabKey } from "@cocalc/util/types/settings";
import { ACTIVITY_BAR_LABELS } from "../project/page/activity-bar-consts";
import { SETTINGS_LANGUAGE_MODEL_KEY } from "./useLanguageModelSetting";

// this is incomplete...

export interface AccountState {
  active_page: string;
  active_sub_tab?: PreferencesSubTabKey;
  user_type: string;
  account_id: string;
  groups?: List<string>;
  terminal: Map<string, any>;
  first_name?: string;
  last_name?: string;
  name?: string;
  unlisted?: boolean;
  profile: TypedMap<{ color: string }>;
  email_address?: string;
  editor_settings: TypedMap<{
    jupyter_classic?: boolean;
    jupyter?: { kernel: string };
    theme?: string;
    physical_keyboard?: string;
    keyboard_variant?: string;
  }>;
  font_size: number;
  other_settings: TypedMap<{
    confirm_close: string;
    page_size?: number;
    [NEW_FILENAMES]?: NewFilenameTypes;
    no_free_warnings?: boolean;
    time_ago_absolute: boolean;
    dark_mode: boolean;
    dark_mode_brightness: number;
    dark_mode_contrast: number;
    dark_mode_sepia: number;
    news_read_until: number; // JavaScript timestamp in milliseconds
    [OTHER_SETTINGS_USERDEFINED_LLM]: string; // string is JSON: CustomLLM[]
    [OTHER_SETTINGS_LOCALE_KEY]?: string;
    [OTHER_SETTINGS_REPLY_ENGLISH_KEY]?: string;
    no_email_new_messages?: boolean;
    use_balance_toward_subscriptions?: boolean;
    show_symbol_bar_labels?: boolean; // whether to show labels on the menu buttons
    [ACTIVITY_BAR_LABELS]?: boolean; // whether to show labels on the vertical activity bar
    quick_nav_hotkey?: Hotkey; // hotkey for quick navigation dialog
    quick_nav_hotkey_delay?: number; // delay threshold in milliseconds for shift+shift detection
  }>;
  stripe_customer?: TypedMap<{
    subscriptions: { data: Map<string, any> };
  }>;
  show_global_info: boolean;
  is_logged_in: boolean;
  signing_up: boolean;
  sign_up_error?: TypedMap<{ generic: string }>;
  signing_in: boolean;
  sign_in_error?: string;
  sign_in_email_address?: string;
  account_deletion_error?: string;
  forgot_password_error?: string;
  forgot_password_success?: string;
  reset_password_error?: string;
  reset_key?: string;
  sign_out_error?: string;
  show_sign_out?: boolean;
  hub?: string;
  remember_me?: boolean;
  has_remember_me?: boolean;
  passports?: Map<string, any>;
  is_anonymous: boolean;
  is_admin: boolean;
  is_ready: boolean; // user signed in and account settings have been loaded.
  lti_id?: List<string>;
  created?: Date;
  strategies?: List<TypedMap<PassportStrategyFrontend>>;
  token?: boolean; // whether or not a registration token is required when creating an account
  keyboard_variant_options?: List<any>;
  show_forgot_password?: boolean;
  email_address_verified?: Map<string, Date>;
  evaluate_key?: string;
  autosave?: number;
  show_purchase_form?: boolean;
  tableError?: TypedMap<{ error: string; query: any }>;
  tags?: string[];
  tours?: string[];
  stripe_usage_subscription?: string;
  stripe_checkout_session?: TypedMap<{ id: string; url: string }>;
  purchase_closing_day?: number;
  email_daily_statements?: boolean;
  [SETTINGS_LANGUAGE_MODEL_KEY]?: LanguageModel;
  i18n: Locale;
  balance?: number;
  min_balance?: number;
  balance_alert?: boolean;
  auto_balance?: TypedMap<AutoBalance>;
  unread_message_count?: number;
  fragment?: TypedMap<{ id?: string }>;
}
