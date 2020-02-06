// config for server settings, which are only visible and editable for admins. in particular, this includes the email backend config.

export type ExtraAllowed = Readonly<string[]> | ((val: string) => boolean);

export interface Extra {
  readonly title: string;
  readonly descr?: string;
  readonly default: string;
  // list of allowed strings or a validator function
  readonly allowed?: ExtraAllowed;
  readonly password?: boolean;
  readonly show?: (conf: any) => boolean;
  // this optional function derives the actual value of this setting from current value.
  readonly to_val?: (val: string) => boolean | string | number;
}

const only_for_smtp = conf => conf.email_backend === "smtp";
const only_for_sendgrid = conf => conf.email_backend === "sendgrid";

// not public, but admins can edit them
export const EXTRAS: { [key: string]: Extra } = {
  email_backend: {
    title: "Email backend type",
    descr: "enter the type of backend",
    default: "",
    allowed: ["sendgrid", "smtp"]
  },
  sendgrid_key: {
    title: "Sendgrid API key",
    descr: "You need a Sendgrid account and then enter a valid API key here",
    default: "",
    show: only_for_sendgrid
  },
  email_smtp_server: {
    title: "SMTP server",
    default: "",
    show: only_for_smtp
  },
  email_smtp_login: {
    title: "SMTP username",
    default: "",
    show: only_for_smtp
  },
  email_smtp_password: {
    title: "SMTP password",
    default: "",
    show: only_for_smtp,
    password: true
  },
  email_smtp_port: {
    title: "SMTP port",
    descr: "Usually: For secure==true use port 465, otherwise port 587 or 25",
    default: "465",
    to_val: val => parseInt(val),
    show: only_for_smtp
  },
  email_smtp_secure: {
    title: "SMTP secure",
    descr: "Usually 'true'",
    default: "true",
    allowed: ["true", "false"],
    to_val: val => val === "true",
    show: only_for_smtp
  }
} as const;
