/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";
import type { KucalcValues } from "@cocalc/util/db-schema/site-defaults";
import type { Strategy } from "@cocalc/util/types/sso";

Table({
  name: "passport_settings",
  rules: {
    primary_key: "strategy",
  },
  fields: {
    strategy: {
      type: "string",
      desc: "a unique lower-case alphanumeric space-free identifier",
    },
    conf: {
      type: "map",
      desc: "a JSON object with the configuration for this strategy, consumed by the 'auth.ts' module",
    },
    info: {
      type: "map",
      desc: "additional public information about this strategy, displayed on the next.js pages, etc.",
    },
  },
});

Table({
  name: "passport_store",
  rules: {
    primary_key: "key",
  },
  fields: {
    key: {
      type: "string",
      desc: "an arbitrary key",
    },
    value: {
      type: "string",
      desc: "an arbitrary value as a string",
    },
    expire: {
      type: "timestamp",
      desc: "when this key expires",
    },
  },
});

Table({
  name: "server_settings",
  rules: {
    primary_key: "name",
    anonymous: false,
    user_query: {
      // NOTE: can *set* but cannot get!
      set: {
        admin: true,
        fields: {
          name: null,
          value: null,
        },
      },
    },
  },
  fields: {
    name: {
      type: "string",
    },
    value: {
      type: "string",
    },
    readonly: {
      type: "boolean",
      desc: "If true, the user interface should not allow to edit that value – it is controlled externally or via an environment variable.",
    },
  },
});

export interface Customize {
  siteName?: string;
  siteDescription?: string;
  organizationName?: string;
  organizationEmail?: string;
  organizationURL?: string;
  termsOfServiceURL?: string;
  helpEmail?: string;
  contactEmail?: string;
  isCommercial?: boolean;
  kucalc?: KucalcValues;
  sshGateway?: boolean;
  sshGatewayDNS?: string;
  logoSquareURL?: string;
  logoRectangularURL?: string;
  splashImage?: string;
  indexInfo?: string;
  indexTagline?: string;
  imprint?: string;
  policies?: string;
  shareServer?: boolean;
  landingPages?: boolean;
  dns?: string;
  siteURL?: string;
  googleAnalytics?: string;
  anonymousSignup?: boolean;
  anonymousSignupLicensedShares?: boolean;
  emailSignup?: boolean;
  accountCreationInstructions?: string;
  zendesk?: boolean; // true if zendesk support is configured.
  stripePublishableKey?: string;
  imprint_html?: string;
  policies_html?: string;
  reCaptchaKey?: string;
  sandboxProjectsEnabled?: boolean;
  sandboxProjectId?: string;
  verifyEmailAddresses?: boolean;
  strategies?: Strategy[];
  openaiEnabled?: boolean;
  googleVertexaiEnabled?: boolean;
  mistralEnabled?: boolean;
  anthropicEnabled?: boolean;
  ollamaEnabled?: boolean;
  neuralSearchEnabled?: boolean;
  jupyterApiEnabled?: boolean;
  computeServersEnabled?: boolean;
  cloudFilesystemsEnabled?: boolean;
  githubProjectId?: string;
  support?: string;
  supportVideoCall?: string;
  version?: {
    min_project?: number;
    min_browser?: number;
    recommended_browser?: number;
    compute_server_min_project?: number;
  };
}
