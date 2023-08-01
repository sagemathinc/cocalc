/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export type BackendType = "smtp" | "smtp2";

export interface SMTPSettings {
  dns: string;
  server: string;
  login: string;
  password: string;
  secure: boolean;
  from: string;
  port?: number;
  pooling?: boolean;
  name: string;
}

export interface EmailSendConfig {
  to: string;
  subject?: string; // overrides the template's subject
  name?: string;
  template: EmailTemplateName;
  test?: boolean;
  locals: Record<string, string | number>;
  priority?: number; // higher, the better. 0 neutral. -1 is queued.
}

export interface EmailTemplateSendConfig {
  template: EmailTemplateName;
  message: { to: string; subject?: string; name?: string };
  locals: Partial<EmailTemplateSenderSettings> &
    Record<string, string | number>;
  test?: boolean;
}

export interface EmailTemplateSenderSettings {
  fromEmail: string;
  fromName: string;
  dns: string;
  siteURL: string; // http[s]://<domain>[/basePath]"
  siteName: string;
  logoSquare: string;
  helpEmail: string;
}

export interface EmailTemplate {
  subject: string;
  template: string; // markdown with mustache variables
  unsubscribe?: boolean; // default true
}

export type EmailTemplateName =
  | "custom"
  | "notification"
  | "welcome"
  | "password_reset"
  | "verify_email"
  | "news";

export interface EmailTemplateSendResult {
  status: "sent" | "test" | "error" | "queued";
  value: any;
}
