// config for server settings, which are only visible and editable for admins. in particular, this includes the email backend config.

export interface Extra {
  readonly title: string;
  readonly descr?: string;
  readonly default: string;
  readonly allowed?: Readonly<string[]>;
  readonly password?: boolean;
  readonly show?: (conf: any) => boolean;
}

const only_for_smtp = conf => conf.email_backend === "smtp";
const only_for_sendgrid = conf => conf.email_backend === "sendgrid";

// not public, but admins can edit them
export const EXTRAS: { [key: string]: Extra } = {
  email_backend: {
    title: "Email Backend",
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
    title: "SMTP Server",
    default: "",
    show: only_for_smtp
  },
  email_smtp_login: {
    title: "SMTP Username",
    default: "",
    show: only_for_smtp
  },
  email_smtp_password: {
    title: "SMTP Password",
    default: "",
    show: only_for_smtp,
    password: true
  },
  email_smtp_port: {
    title: "SMTP Port",
    descr: "Usually: For secure==true use port 465, otherwise port 587 or 25",
    default: "465",
    show: only_for_smtp
  },
  email_smtp_secure: {
    title: "SMTP Secure",
    descr: "Usually 'true'",
    default: "true",
    allowed: ["true", "false"],
    show: only_for_smtp
  }
} as const;
