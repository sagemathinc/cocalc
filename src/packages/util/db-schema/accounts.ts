/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";
import { checkAccountName } from "./name-rules";

import {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
} from "./defaults";

Table({
  name: "accounts",
  fields: {
    account_id: {
      type: "uuid",
      desc: "The uuid that determines the user account",
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
      desc: "hash of the password",
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
    email_address: {
      type: "string",
      pg_type: "VARCHAR(254)", // see http://stackoverflow.com/questions/386294/what-is-the-maximum-length-of-a-valid-email-address
      desc: "The email address of the user.  This is optional, since users may instead be associated to passport logins.",
      unique: true,
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
      desc: "Miscellaneous overall configuration settings for SMC, e.g., confirm close on exit?",
    },
    first_name: {
      type: "string",
      pg_type: "VARCHAR(254)", // some limit (actually around 3000) is required for indexing
      desc: "The first name of this user.",
    },
    last_name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The last name of this user.",
    },
    banned: {
      type: "boolean",
      desc: "Whether or not this user is banned.",
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
      desc: "Information about customer from the point of view of stripe (exactly what is returned by stripe.customers.retrieve).",
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
          account_id: null,
          email_address: null,
          lti_id: null,
          email_address_verified: null,
          email_address_problem: null,
          editor_settings: {
            /* NOTE: there is a editor_settings.jupyter = { kernel...} that isn't documented here. */
            strip_trailing_whitespace: false,
            show_trailing_whitespace: true,
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
            disable_jupyter_windowing: false,
            show_exec_warning: true,
            physical_keyboard: "default",
            keyboard_variant: "",
            ask_jupyter_kernel: true,
            disable_jupyter_virtualization: false,
          },
          other_settings: {
            katex: true,
            confirm_close: false,
            mask_files: true,
            page_size: 500,
            standby_timeout_m: 5,
            default_file_sort: "time",
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
                `name "${obj["name"]}" is already taken by another organization or account`
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
  "lesser-dark": "Lesser dark",
  liquibyte: "Liquibyte",
  lucario: "Lucario",
  material: "Material",
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
  zenburn: "Zenburn",
};
