/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Site Settings Config for the servers (hubs)
// They are only visible and editable for admins and services.
// in particular, this includes the email backend config, Stripe, etc.

import {
  Config,
  only_for_smtp,
  only_for_sendgrid,
  only_for_password_reset_smtp,
  to_bool,
  only_booleans,
  to_int,
  only_nonneg_int,
  only_commercial,
} from "./site-defaults";

const { is_valid_email_address } = require("smc-util/misc");

export type SiteSettingsExtrasKeys =
  | "stripe_heading"
  | "stripe_publishable_key"
  | "stripe_secret_key"
  | "email_backend"
  | "sendgrid_key"
  | "email_smtp_server"
  | "email_smtp_from"
  | "email_smtp_login"
  | "email_smtp_password"
  | "email_smtp_port"
  | "email_smtp_secure"
  | "password_reset_override"
  | "password_reset_smtp_server"
  | "password_reset_smtp_from"
  | "password_reset_smtp_login"
  | "password_reset_smtp_password"
  | "password_reset_smtp_port"
  | "password_reset_smtp_secure";

export type SettingsExtras = Record<SiteSettingsExtrasKeys, Config>;

// not public, but admins can edit them
export const EXTRAS: SettingsExtras = {
  stripe_heading: {
    // this is consmetic, otherwise it looks weird.
    name: "Stripe Keys",
    desc: "",
    default: "",
    show: only_commercial,
    type: "header",
  },
  stripe_publishable_key: {
    name: "Stripe Publishable",
    desc: "Stripe calls this key 'publishable'",
    default: "",
    password: false,
    show: only_commercial,
  },
  stripe_secret_key: {
    name: "Stripe Secret",
    desc: "Stripe calls this key 'secret'",
    default: "",
    show: only_commercial,
    password: true,
  },
  email_backend: {
    name: "Email backend type",
    desc:
      "The type of backend for sending emails ('none' means there is none).",
    default: "",
    valid: ["none", "sendgrid", "smtp"],
  },
  sendgrid_key: {
    name: "Sendgrid API key",
    desc: "You need a Sendgrid account and then enter a valid API key here",
    password: true,
    default: "",
    show: only_for_sendgrid,
  },
  email_smtp_server: {
    name: "SMTP server",
    desc: "the hostname to talk to",
    default: "",
    show: only_for_smtp,
  },
  email_smtp_from: {
    name: "SMTP server FROM",
    desc: "the FROM and REPLYTO email address",
    default: "",
    valid: is_valid_email_address,
    show: only_for_smtp,
  },
  email_smtp_login: {
    name: "SMTP username",
    desc: "the username, for PLAIN login",
    default: "",
    show: only_for_smtp,
  },
  email_smtp_password: {
    name: "SMTP password",
    desc: "the password, for PLAIN login",
    default: "",
    show: only_for_smtp,
    password: true,
  },
  email_smtp_port: {
    name: "SMTP port",
    desc: "Usually: For secure==true use port 465, otherwise port 587 or 25",
    default: "465",
    to_val: to_int,
    valid: only_nonneg_int,
    show: only_for_smtp,
  },
  email_smtp_secure: {
    name: "SMTP secure",
    desc: "Usually 'true'",
    default: "true",
    valid: only_booleans,
    to_val: to_bool,
    show: only_for_smtp,
  },
  password_reset_override: {
    name: "Password reset backend",
    desc:
      "If 'default', it uses the usual email backend to send password resets. If 'smtp', an additional SMTP config shows up",
    default: "default",
    valid: ["default", "smtp"],
  },
  password_reset_smtp_server: {
    name: "PW reset SMTP server",
    desc: "hostname sending password reset emails",
    default: "",
    show: only_for_password_reset_smtp,
  },
  password_reset_smtp_from: {
    name: "PW reset FROM",
    desc: "This sets the FROM and REPLYTO email address",
    default: "",
    valid: is_valid_email_address,
    show: only_for_password_reset_smtp,
  },
  password_reset_smtp_login: {
    name: "PW reset SMTP username",
    desc: "username, PLAIN auth",
    default: "",
    show: only_for_password_reset_smtp,
  },
  password_reset_smtp_password: {
    name: "PW reset SMTP password",
    desc: "password, PLAIN auth",
    default: "",
    show: only_for_password_reset_smtp,
    password: true,
  },
  password_reset_smtp_port: {
    name: "PW reset SMTP port",
    desc: "Usually: For secure==true use port 465, otherwise port 587 or 25",
    default: "465",
    to_val: to_int,
    valid: only_nonneg_int,
    show: only_for_password_reset_smtp,
  },
  password_reset_smtp_secure: {
    name: "PW reset SMTP secure",
    desc: "Usually 'true'",
    default: "true",
    valid: only_booleans,
    to_val: to_bool,
    show: only_for_password_reset_smtp,
  },
} as const;
