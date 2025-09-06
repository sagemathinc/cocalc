/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { NOTES } from "./crm";
import { SCHEMA as schema } from "./index";
import { checkAccountName } from "./name-rules";
import { Table } from "./types";

import {
  DEFAULT_FONT_SIZE,
  DEFAULT_NEW_FILENAMES,
  NEW_FILENAMES,
  OTHER_SETTINGS_USERDEFINED_LLM,
} from "./defaults";

import { DEFAULT_LOCALE } from "@cocalc/util/consts/locale";

export const USER_SEARCH_LIMIT = 250;
export const ADMIN_SEARCH_LIMIT = 2500;

export const USE_BALANCE_TOWARD_SUBSCRIPTIONS =
  "use_balance_toward_subscriptions";
export const USE_BALANCE_TOWARD_SUBSCRIPTIONS_DEFAULT = true;

// AutoBalance: Every parameter is in dollars.
export interface AutoBalance {
  // deposit money when the balance goes below this
  trigger: number;
  // amount to automatically add
  amount: number;
  // max amount of money to add per day
  max_day: number;
  // max amount of money to add per week
  max_week: number;
  // max amount of money to add per month
  max_month: number;
  // period -- which of max_day, max_week, or max_month to actually enforce.
  // we always enforce **exactly one of them**.
  period: "day" | "week" | "month";
  // switch to disable/enable this.
  enabled: boolean;
  // if credit was not added, last reason why (at most 1024 characters)
  reason?: string;
  // ms since epoch of last attempt
  time?: number;
  // how much has been added at the moment when we last updated.
  status?: { day: number; week: number; month: number };
}

// each of the parameters above must be a number in the
// given interval below.
// All fields should always be explicitly specified.
export const AUTOBALANCE_RANGES = {
  trigger: [5, 250],
  amount: [10, 250],
  max_day: [5, 1000],
  max_week: [5, 5000],
  max_month: [5, 10000],
};

export const AUTOBALANCE_DEFAULTS = {
  trigger: 10,
  amount: 20,
  max_day: 200,
  max_week: 1000,
  max_month: 2500,
  period: "week",
  enabled: true,
} as AutoBalance;

// throw error if not valid
export function ensureAutoBalanceValid(obj) {
  if (obj == null) {
    return;
  }
  if (typeof obj != "object") {
    throw Error("must be an object");
  }
  for (const key in AUTOBALANCE_RANGES) {
    if (obj[key] == null) {
      throw Error(`${key} must be specified`);
    }
  }
  for (const key in obj) {
    if (key == "period") {
      if (!["day", "week", "month"].includes(obj[key])) {
        throw Error(`${key} must be 'day', 'week' or 'month'`);
      }
      continue;
    }
    if (key == "enabled") {
      if (typeof obj[key] != "boolean") {
        throw Error(`${key} must be boolean`);
      }
      continue;
    }
    if (key == "reason") {
      if (typeof obj[key] != "string") {
        throw Error(`${key} must be a string`);
      }
      if (obj[key].length > 1024) {
        throw Error(`${key} must be at most 1024 characters`);
      }
      continue;
    }
    if (key == "time") {
      if (typeof obj[key] != "number") {
        throw Error(`${key} must be a number`);
      }
      continue;
    }
    if (key == "status") {
      if (typeof obj[key] != "object") {
        throw Error(`${key} must be an object`);
      }
      continue;
    }
    const range = AUTOBALANCE_RANGES[key];
    if (range == null) {
      throw Error(`invalid key '${key}'`);
    }
    const value = obj[key];
    if (typeof value != "number") {
      throw Error("every value must be a number");
    }
    if (value < range[0]) {
      throw Error(`${key} must be at least ${range[0]}`);
    }
    if (value > range[1]) {
      throw Error(`${key} must be at most ${range[1]}`);
    }
  }
}

Table({
  name: "accounts",
  fields: {
    account_id: {
      type: "uuid",
      desc: "The uuid that determines the user account",
      render: { type: "account" },
      title: "Account",
    },
    created: {
      type: "timestamp",
      desc: "When the account was created.",
    },
    created_by: {
      type: "string",
      pg_type: "inet",
      desc: "IP address that created the account.",
    },
    creation_actions_done: {
      type: "boolean",
      desc: "Set to true after all creation actions (e.g., add to projects) associated to this account are succesfully completed.",
    },
    password_hash: {
      type: "string",
      pg_type: "VARCHAR(173)",
      desc: "Hash of the password. This is 1000 iterations of sha512 with salt of length 32.",
    },
    deleted: {
      type: "boolean",
      desc: "True if the account has been deleted.",
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(39)",
      desc: "The username of this user.  This is optional but globally unique across all accoutns *and* organizations.  It can be between 1 and 39 characters from a-z A-Z 0-9 - and must not start with a dash.",
    },
    org: {
      type: "string",
      prg_type: "VARCHAR(39)",
      desc: "If this account is associated to an organization, then this is the *name* of the organization.  An account may be associated with at most one organization.",
    },
    email_address: {
      type: "string",
      pg_type: "VARCHAR(254)", // see http://stackoverflow.com/questions/386294/what-is-the-maximum-length-of-a-valid-email-address
      desc: "The email address of the user.  This is optional, since users may instead be associated to passport logins.",
      unique: true,
      render: { type: "email_address" },
    }, // only one record in database can have this email address (if given)
    email_address_before_delete: {
      type: "string",
      desc: "The email address of the user before they deleted their account.",
    },
    email_address_verified: {
      type: "map",
      desc: 'Verified email addresses as { "email@addre.ss" : <timestamp>, ... }',
    },
    email_address_challenge: {
      type: "map",
      desc: 'Contains random token for verification of an address: {"email": "...", "token": <random>, "time" : <timestamp for timeout>}',
    },
    email_address_problem: {
      type: "map",
      desc: 'Describes a problem with a given email address. example: { "wrong@email.address" : { "type": "bounce", "time": "2018-...", "mesg": "554 5.7.1 <....>: Recipient address rejected: Access denied, user does not exist", "status": <status code>}}',
    },
    passports: {
      type: "map",
      desc: 'Map from string ("[strategy]-[id]") derived from passport name and id to the corresponding profile',
    },
    editor_settings: {
      type: "map",
      desc: "Description of configuration settings for the editor.  See the user_query get defaults.",
    },
    other_settings: {
      type: "map",
      desc: "Miscellaneous overall configuration settings for CoCalc, e.g., confirm close on exit?",
    },
    first_name: {
      type: "string",
      pg_type: "VARCHAR(254)", // some limit (actually around 3000) is required for indexing
      desc: "The first name of this user.",
      render: { type: "text", maxLength: 254, editable: true },
    },
    last_name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The last name of this user.",
      render: { type: "text", maxLength: 254, editable: true },
    },
    banned: {
      type: "boolean",
      desc: "Whether or not this user is banned.",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    terminal: {
      type: "map",
      desc: "Settings for the terminal, e.g., font_size, etc. (see get query)",
    },
    autosave: {
      type: "integer",
      desc: "File autosave interval in seconds",
    },
    evaluate_key: {
      type: "string",
      desc: "Key used to evaluate code in Sage worksheet.",
    },
    font_size: {
      type: "integer",
      desc: "Default font-size for the editor, jupyter, etc. (px)",
    },
    last_active: {
      type: "timestamp",
      desc: "When this user was last active.",
    },
    stripe_customer_id: {
      type: "string",
      desc: "The id of this customer in the stripe billing system.",
    },
    stripe_customer: {
      type: "map",
      desc: "Information about customer from the point of view of stripe (exactly what is returned by stripe.customers.retrieve)   ALMOST DEPRECATED -- THIS IS ONLY USED FOR OLD LEGACY UPGRADES.",
    },
    coupon_history: {
      type: "map",
      desc: "Information about which coupons the customer has used and the number of times",
    },
    profile: {
      type: "map",
      desc: "Information related to displaying an avatar for this user's location and presence in a document or chatroom.",
    },
    groups: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "Array of groups that this user belongs to; usually empty.  The only group right now is 'admin', which grants admin rights.",
    },
    ssh_keys: {
      type: "map",
      desc: "Map from ssh key fingerprints to ssh key objects.",
    },
    api_key: {
      type: "string",
      desc: "Optional API key that grants full API access to anything this account can access. Key is of the form 'sk_9QabcrqJFy7JIhvAGih5c6Nb', where the random part is 24 characters (base 62).",
      unique: true,
    },
    sign_up_usage_intent: {
      type: "string",
      desc: "What user intended to use CoCalc for at sign up",
      render: { type: "text" },
    },
    lti_id: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "LTI ISS and user ID",
    },
    lti_data: {
      type: "map",
      desc: "extra information related to LTI",
    },
    unlisted: {
      type: "boolean",
      desc: "If true then exclude user for full name searches (but not exact email address searches).",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    tags: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "Tags expressing what this user is most interested in doing.",
      render: { type: "string-tags", editable: true },
    },
    tours: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "Tours that user has seen, so once they are here they are hidden from the UI.  The special tour 'all' means to disable all tour buttons.",
      render: { type: "string-tags" },
    },
    notes: NOTES,
    salesloft_id: {
      type: "integer",
      desc: "The id of corresponding person in salesloft, if they exist there.",
      render: {
        type: "number",
        integer: true,
        editable: true,
        min: 1,
      },
    },
    purchase_closing_day: {
      type: "integer",
      desc: "Day of the month when pay-as-you-go purchases are cutoff and charged for this user. It happens at midnight UTC on this day.  This should be an integer between 1 and 28.",
      render: {
        type: "number",
        editable: false, // Do NOT change this without going through the reset-closing-date api call...
        min: 1,
        max: 28,
      },
    },
    min_balance: {
      type: "number",
      pg_type: "REAL",
      desc: "The minimum allowed balance for this user. This is a quota we impose for safety, not something they set. Admins may change this in response to a support request.  For most users this is not set at all hence 0, but for some special enterprise-style customers to whom we extend 'credit', it will be set.",
      render: {
        title: "Minimum Allowed Balance (USD)",
        type: "number",
        integer: false,
        editable: true,
        max: 0,
      },
    },
    balance: {
      type: "number",
      pg_type: "REAL",
      desc: "Last computed balance for this user.  NOT a source of truth.  Meant to ensure all frontend clients show the same thing.  Probably also useful for db queries and maybe analytics.",
      render: {
        title: "Account Balance (USD)",
        type: "number",
        integer: false,
        editable: false,
      },
    },
    balance_alert: {
      type: "boolean",
      desc: "If true, the UI will very strongly encourage user to open their balance modal.",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    auto_balance: {
      type: "map",
      desc: "Determines protocol for automatically adding money to account.  This is relevant for pay as you go users.  The interface AutoBalance describes the parameters.  The user can in theory set this to anything, but ]",
    },
    stripe_checkout_session: {
      type: "map",
      desc: "Part of the current open stripe checkout session object, namely {id:?, url:?}, but none of the other info.  When user is going to add credit to their account, we create a stripe checkout session and store it here until they complete checking out.  This makes it possible to guide them back to the checkout session, in case anything goes wrong, and also avoids confusion with potentially multiple checkout sessions at once.",
    },
    stripe_usage_subscription: {
      type: "string",
      pg_type: "varchar(256)",
      desc: "Id of this user's stripe metered usage subscription, if they have one.",
    },
    email_daily_statements: {
      type: "boolean",
      desc: "If true, try to send daily statements to user showing all of their purchases.  If false or not set, then do not.  NOTE: we always try to email monthly statements to users.",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    owner_id: {
      type: "uuid",
      desc: "If one user (owner_id) creates an account for another user via the API, then this records who created the account.  They may have special privileges at some point.",
      render: { type: "account" },
      title: "Owner",
    },
    unread_message_count: {
      type: "integer",
      desc: "Number of unread messages in the messages table for this user.  This gets updated whenever the messages table for this user gets changed, making it easier to have UI etc when there are unread messages.",
      render: {
        type: "number",
        editable: false,
        min: 0,
      },
    },
    last_message_summary: {
      type: "timestamp",
      desc: "The last time the system sent an email to this user with a summary about new messages (see messages.ts).",
    },
  },
  rules: {
    desc: "All user accounts.",
    primary_key: "account_id",
    // db_standby: "unsafe",
    pg_indexes: [
      "(lower(first_name) text_pattern_ops)",
      "(lower(last_name)  text_pattern_ops)",
      "created_by",
      "created",
      "last_active DESC NULLS LAST",
      "lti_id",
      "unlisted",
      "((passports IS NOT NULL))",
      "((ssh_keys IS NOT NULL))", // used by ssh-gateway to speed up getting all users
    ],
    crm_indexes: [
      "(lower(first_name) text_pattern_ops)",
      "(lower(last_name)  text_pattern_ops)",
      "(lower(email_address)  text_pattern_ops)",
      "created",
      "last_active DESC NULLS LAST",
    ],
    pg_unique_indexes: [
      "api_key", // we use the map api_key --> account_id, so it better be unique
      "LOWER(name)", // ensure user-assigned name is case sensitive globally unique
    ], // note that we actually require uniqueness across accounts and organizations
    // and this index is just a step in that direction; full uniquness must be
    // checked as an extra step.
    user_query: {
      get: {
        throttle_changes: 500,
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          // Exactly what from the below is sync'd by default with the frontend app client is explicitly
          // listed in frontend/account/table.ts
          account_id: null,
          email_address: null,
          org: null,
          lti_id: null,
          stripe_checkout_session: null,
          email_address_verified: null,
          email_address_problem: null,
          editor_settings: {
            /* NOTE: there is a editor_settings.jupyter = { kernel...} that isn't documented here. */
            strip_trailing_whitespace: false,
            show_trailing_whitespace: false,
            line_wrapping: true,
            line_numbers: true,
            jupyter_line_numbers: false,
            smart_indent: true,
            electric_chars: true,
            match_brackets: true,
            auto_close_brackets: true,
            code_folding: true,
            match_xml_tags: true,
            auto_close_xml_tags: true,
            auto_close_latex: true,
            spaces_instead_of_tabs: true,
            multiple_cursors: true,
            track_revisions: true,
            extra_button_bar: true,
            build_on_save: true,
            first_line_number: 1,
            indent_unit: 4,
            tab_size: 4,
            bindings: "standard",
            theme: "default",
            undo_depth: 300,
            jupyter_classic: false,
            jupyter_window: false,
            disable_jupyter_windowing: true,
            show_exec_warning: true,
            physical_keyboard: "default",
            keyboard_variant: "",
            ask_jupyter_kernel: true,
            show_my_other_cursors: false,
            disable_jupyter_virtualization: true,
          },
          other_settings: {
            katex: true,
            confirm_close: false,
            mask_files: true,
            page_size: 500,
            standby_timeout_m: 15,
            default_file_sort: "name",
            [NEW_FILENAMES]: DEFAULT_NEW_FILENAMES,
            show_global_info2: null,
            first_steps: true,
            newsletter: false,
            time_ago_absolute: false,
            // if true, do not show warning when using non-member projects
            no_free_warnings: false,
            allow_mentions: true,
            dark_mode: false,
            dark_mode_brightness: 100,
            dark_mode_contrast: 90,
            dark_mode_sepia: 0,
            dark_mode_grayscale: 0,
            news_read_until: 0,
            hide_project_popovers: false,
            hide_file_popovers: false,
            hide_button_tooltips: false,
            [OTHER_SETTINGS_USERDEFINED_LLM]: "[]",
            i18n: DEFAULT_LOCALE,
            no_email_new_messages: false,
            [USE_BALANCE_TOWARD_SUBSCRIPTIONS]:
              USE_BALANCE_TOWARD_SUBSCRIPTIONS_DEFAULT,
            hide_navbar_balance: false,
          },
          name: null,
          first_name: "",
          last_name: "",
          terminal: {
            font_size: DEFAULT_FONT_SIZE,
            color_scheme: "default",
            font: "monospace",
          },
          autosave: 45,
          evaluate_key: "Shift-Enter",
          font_size: DEFAULT_FONT_SIZE,
          passports: {},
          groups: [],
          last_active: null,
          stripe_customer: null,
          coupon_history: null,
          profile: {
            image: undefined,
            color: "rgb(170,170,170)",
          },
          ssh_keys: {},
          created: null,
          unlisted: false,
          tags: null,
          tours: null,
          min_balance: null,
          balance: null,
          balance_alert: null,
          auto_balance: null,
          purchase_closing_day: null,
          stripe_usage_subscription: null,
          email_daily_statements: null,
          unread_message_count: null,
        },
      },
      set: {
        fields: {
          account_id: "account_id",
          name: true,
          editor_settings: true,
          other_settings: true,
          first_name: true,
          last_name: true,
          terminal: true,
          autosave: true,
          evaluate_key: true,
          font_size: true,
          profile: true,
          ssh_keys: true,
          sign_up_usage_intent: true,
          unlisted: true,
          tags: true,
          tours: true,
          email_daily_statements: true,
          // obviously min_balance can't be set!
          auto_balance: true,
        },
        async check_hook(db, obj, account_id, _project_id, cb) {
          if (obj["name"] != null) {
            // NOTE: there is no way to unset/remove a username after one is set...
            try {
              checkAccountName(obj["name"]);
            } catch (err) {
              cb(err.toString());
              return;
            }
            const id = await db.nameToAccountOrOrganization(obj["name"]);
            if (id != null && id != account_id) {
              cb(
                `name "${obj["name"]}" is already taken by another organization or account`,
              );
              return;
            }
          }
          // Hook to truncate some text fields to at most 254 characters, to avoid
          // further trouble down the line.
          for (const field of ["first_name", "last_name", "email_address"]) {
            if (obj[field] != null) {
              obj[field] = obj[field].slice(0, 254);
              if (field != "email_address" && !obj[field]) {
                // name fields can't be empty
                cb(`${field} must be nonempty`);
                return;
              }
            }
          }

          // Make sure auto_balance is valid.
          if (obj["auto_balance"] != null) {
            try {
              ensureAutoBalanceValid(obj["auto_balance"]);
            } catch (err) {
              cb(`${err}`);
              return;
            }
          }
          cb();
        },
      },
    },
  },
});

export const EDITOR_BINDINGS = {
  standard: "Standard",
  sublime: "Sublime",
  vim: "Vim",
  emacs: "Emacs",
};

export const EDITOR_COLOR_SCHEMES: { [name: string]: string } = {
  default: "Default",
  "3024-day": "3024 day",
  "3024-night": "3024 night",
  abcdef: "abcdef",
  abbott: "Abbott",
  "ayu-dark": "Ayu dark",
  "ayu-mirage": "Ayu mirage",
  //'ambiance-mobile'         : 'Ambiance mobile'  # doesn't highlight python, confusing
  ambiance: "Ambiance",
  "base16-dark": "Base 16 dark",
  "base16-light": "Base 16 light",
  bespin: "Bespin",
  blackboard: "Blackboard",
  cobalt: "Cobalt",
  colorforth: "Colorforth",
  darcula: "Darcula",
  dracula: "Dracula",
  "duotone-dark": "Duotone Dark",
  "duotone-light": "Duotone Light",
  eclipse: "Eclipse",
  elegant: "Elegant",
  "erlang-dark": "Erlang dark",
  "gruvbox-dark": "Gruvbox-Dark",
  hopscotch: "Hopscotch",
  icecoder: "Icecoder",
  idea: "Idea", // this messes with the global hinter CSS!
  isotope: "Isotope",
  juejin: "Juejin",
  "lesser-dark": "Lesser dark",
  liquibyte: "Liquibyte",
  lucario: "Lucario",
  material: "Material",
  "material-darker": "Material darker",
  "material-ocean": "Material ocean",
  "material-palenight": "Material palenight",
  mbo: "mbo",
  "mdn-like": "MDN like",
  midnight: "Midnight",
  monokai: "Monokai",
  neat: "Neat",
  neo: "Neo",
  night: "Night",
  "oceanic-next": "Oceanic next",
  "panda-syntax": "Panda syntax",
  "paraiso-dark": "Paraiso dark",
  "paraiso-light": "Paraiso light",
  "pastel-on-dark": "Pastel on dark",
  railscasts: "Railscasts",
  rubyblue: "Rubyblue",
  seti: "Seti",
  shadowfox: "Shadowfox",
  "solarized dark": "Solarized dark",
  "solarized light": "Solarized light",
  ssms: "ssms",
  "the-matrix": "The Matrix",
  "tomorrow-night-bright": "Tomorrow Night - Bright",
  "tomorrow-night-eighties": "Tomorrow Night - Eighties",
  ttcn: "ttcn",
  twilight: "Twilight",
  "vibrant-ink": "Vibrant ink",
  "xq-dark": "Xq dark",
  "xq-light": "Xq light",
  yeti: "Yeti",
  yonce: "Yonce",
  zenburn: "Zenburn",
};

Table({
  name: "crm_accounts",
  rules: {
    virtual: "accounts",
    primary_key: "account_id",
    user_query: {
      get: {
        pg_where: [],
        admin: true, // only admins can do get queries on this table
        fields: {
          ...schema.accounts.user_query?.get?.fields,
          banned: null,
          groups: null,
          notes: null,
          salesloft_id: null,
          sign_up_usage_intent: null,
          owner_id: null,
          deleted: null,
        },
      },
      set: {
        admin: true, // only admins can do get queries on this table
        fields: {
          account_id: true,
          name: true,
          first_name: true,
          last_name: true,
          autosave: true,
          font_size: true,
          banned: true,
          unlisted: true,
          notes: true,
          tags: true,
          salesloft_id: true,
          purchase_closing_day: true,
          min_balance: true, // admins can set this
        },
      },
    },
  },
  fields: schema.accounts.fields,
});

Table({
  name: "crm_agents",
  rules: {
    virtual: "accounts",
    primary_key: "account_id",
    user_query: {
      get: {
        // There where condition restricts to only admin accounts for now.
        // TODO: Later this will change to 'crm'=any(groups) or something like that.
        pg_where: ["'admin'=any(groups)"],
        admin: true, // only admins can do get queries on this table
        fields: schema.accounts.user_query?.get?.fields ?? {},
      },
    },
  },
  fields: schema.accounts.fields,
});

interface Tag {
  label: string;
  tag: string;
  language?: string; // language of jupyter kernel
  icon?: any; // I'm not going to import the IconName type from @cocalc/frontend
  welcome?: string; // a simple "welcome" of this type
  jupyterExtra?: string;
  torun?: string; // how to run this in a terminal (e.g., for a .py file).
  color?: string;
  description?: string;
}

// They were used up until 2024-01-05
export const TAGS_FEATURES: Tag[] = [
  { label: "Jupyter", tag: "ipynb", color: "magenta" },
  {
    label: "Python",
    tag: "py",
    language: "python",
    welcome: 'print("Welcome to CoCalc from Python!")',
    torun: "# Click Terminal, then type 'python3 welcome.py'",
    color: "red",
  },
  {
    label: "AI / GPUs",
    tag: "gpu",
    color: "volcano",
    icon: "gpu",
  },
  {
    label: "R Stats",
    tag: "R",
    language: "r",
    welcome: 'print("Welcome to CoCalc from R!")',
    torun: "# Click Terminal, then type 'Rscript welcome.R'",
    color: "orange",
  },
  {
    label: "SageMath",
    tag: "sage",
    language: "sagemath",
    welcome: "print('Welcome to CoCalc from Sage!', factor(2024))",
    torun: "# Click Terminal, then type 'sage welcome.sage'",
    color: "gold",
  },
  {
    label: "Octave",
    icon: "octave",
    tag: "m",
    language: "octave",
    welcome: `disp("Welcome to CoCalc from Octave!")`,
    torun: "% Click Terminal, then type 'octave --no-window-system welcome.m'",
    color: "geekblue",
  },
  {
    label: "Linux",
    icon: "linux",
    tag: "term",
    language: "bash",
    welcome: "echo 'Welcome to CoCalc from Linux/BASH!'",
    color: "green",
  },
  {
    label: "LaTeX",
    tag: "tex",
    welcome: `\\documentclass{article}
\\title{Welcome to CoCalc from \\LaTeX{}!}
\\begin{document}
\\maketitle
\\end{document}`,
    color: "cyan",
  },
  {
    label: "C/C++",
    tag: "c",
    language: "C++17",
    icon: "cube",
    welcome: `
#include <stdio.h>
int main() {
    printf("Welcome to CoCalc from C!\\n");
    return 0;
}`,
    jupyterExtra: "\nmain();\n",
    torun: "/* Click Terminal, then type 'gcc welcome.c && ./a.out' */",
    color: "blue",
  },
  {
    label: "Julia",
    language: "julia",
    icon: "julia",
    tag: "jl",
    welcome: 'println("Welcome to CoCalc from Julia!")',
    torun: "# Click Terminal, then type 'julia welcome.jl' */",
    color: "geekblue",
  },
  {
    label: "Markdown",
    tag: "md",
    welcome:
      "# Welcome to CoCalc from Markdown!\n\nYou can directly edit the rendered markdown -- try it!\n\nAnd run code:\n\n```py\n2+3\n```\n",
    color: "purple",
  },
  //   {
  //     label: "Whiteboard",
  //     tag: "board",
  //     welcome: `{"data":{"color":"#252937"},"h":96,"id":"1244fb1f","page":"b7cda7e9","str":"# Welcome to CoCalc from a Whiteboard!\\n\\n","type":"text","w":779,"x":-305,"y":-291,"z":1}
  // {"data":{"pos":0},"id":"b7cda7e9","type":"page","z":0}`,
  //   },
  { label: "Teaching", tag: "course", color: "green" },
];

export const TAG_TO_FEATURE: { [key: string]: Readonly<Tag> } = {};
for (const t of TAGS_FEATURES) {
  TAG_TO_FEATURE[t.tag] = t;
}

const professional = "professional";

// Tags specific to user roles or if they want to be contacted
export const TAGS_USERS: Readonly<Tag[]> = [
  {
    label: "Personal",
    tag: "personal",
    icon: "user",
    description: "You are interesting in using CoCalc for personal use.",
  },
  {
    label: "Professional",
    tag: professional,
    icon: "coffee",
    description: "You are using CoCalc as an employee or freelancer.",
  },
  {
    label: "Instructor",
    tag: "instructor",
    icon: "graduation-cap",
    description: "You are teaching a course.",
  },
  {
    label: "Student",
    tag: "student",
    icon: "smile",
    description: "You are a student in a course.",
  },
] as const;

export const TAGS = TAGS_USERS;

export const TAGS_MAP: { [key: string]: Readonly<Tag> } = {};
for (const x of TAGS) {
  TAGS_MAP[x.tag] = x;
}

export const CONTACT_TAG = "contact";
export const CONTACT_THESE_TAGS = [professional];

export interface UserSearchResult {
  account_id: string;
  first_name?: string;
  last_name?: string;
  name?: string; // "vanity" username
  last_active?: number; // ms since epoch -- when account was last active
  created?: number; // ms since epoch -- when account created
  banned?: boolean; // true if this user has been banned (only set for admin searches, obviously)
  email_address_verified?: boolean; // true if their email has been verified (a sign they are more trustworthy).
  // For security reasons, the email_address *only* occurs in search queries that
  // are by email_address (or for admins); we must not reveal email addresses
  // of users queried by substring searches, obviously.
  email_address?: string;
}

export const ACCOUNT_ID_COOKIE_NAME = "account_id";
