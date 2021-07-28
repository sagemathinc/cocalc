/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";
import { NewFilenameTypes } from "../project/utils";
import { PassportStrategy } from "./passport-types";
import { TypedMap } from "../app-framework";
import { MessageInfo } from "../client/hub";

export interface AccountState {
  active_page: string;
  user_type: string;
  account_id: string;
  groups?: string[];
  terminal: immutable.Map<string, any>;
  first_name?: string;
  last_name?: string;
  unlisted?: boolean;
  profile: TypedMap<{ color: string }>;
  email_address?: string;
  editor_settings: TypedMap<{
    jupyter_classic?: boolean;
    jupyter?: { kernel: string };
  }>;
  font_size: number;
  other_settings: TypedMap<{
    confirm_close: string;
    page_size?: number;
    new_filenames?: NewFilenameTypes;
    no_free_warnings?: boolean;
  }>;
  stripe_customer?: TypedMap<{
    subscriptions: { data: immutable.Map<string, any> };
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
  mesg_info?: TypedMap<MessageInfo>;
  hub?: string;
  remember_me?: boolean;
  has_remember_me?: boolean;
  passports?: immutable.Map<string, any>;
  is_anonymous: boolean;
  is_admin: boolean;
  is_ready: boolean; // user signed in and account settings have been loaded.
  doing_anonymous_setup?: boolean;
  lti_id?: immutable.List<string>;
  created?: Date;
  strategies?: immutable.List<TypedMap<PassportStrategy>>;
  token?: boolean; // whether or not a registration token is required when creating an account
  keyboard_variant_options?: immutable.List<any>;
  show_forgot_password?: boolean;
  email_address_verified?: immutable.Map<string, Date>;
  evaluate_key?: string;
  autosave?: number;
  show_purchase_form?: boolean;
}
