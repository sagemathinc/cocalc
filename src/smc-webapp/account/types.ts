import * as immutable from "immutable";

export interface AccountState {
  active_page: string;
  user_type: string;
  account_id: string;
  groups?: string[];
  terminal: immutable.Map<string, any>;
  first_name: string;
  last_name: string;
  profile: { color: string };
  email_address: string;
  editor_settings: { jupyter_classic?: boolean; jupyter?: { kernel: string } };
  font_size: number;
  other_settings: { confirm_close: string; page_size?: number };
  stripe_customer?: { subscriptions: { data: immutable.Map<string, any> } };
  show_global_info: boolean;
  is_logged_in: boolean;
  signing_up: boolean;
  sign_up_error?: { generic: string };
  signing_in: boolean;
  sign_in_error?: string;
  account_deletion_error?: string;
  forgot_password_error?: string;
  forgot_password_success?: string;
  reset_password_error?: string;
  reset_key?: string;
  sign_out_error?: string;
  show_sign_out?: boolean;
}
