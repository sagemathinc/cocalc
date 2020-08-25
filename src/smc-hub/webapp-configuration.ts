/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this manages the webapp's configuration based on the hostname (allows whitelabeling)

import { parseDomain, ParseResultType } from "parse-domain";

import { PostgreSQL } from "./postgres/types";

const server_settings = require("./server-settings");

export class WebappConfiguration {
  readonly db: PostgreSQL;
  private data: any;

  constructor({ db }) {
    this.db = db;
    this.data = server_settings(this.db);
  }

  // derive the vanity ID from the host string
  private vanity(host: string): string | undefined {
    const host_parsed = parseDomain(host);
    if (host_parsed.type === ParseResultType.Listed) {
      // vanity for vanity.cocalc.com or foo.p for foo.p.cocalc.com
      return host_parsed.subDomains.join(".");
    }
    return undefined;
  }

  public get(req) {
    const host = req.headers["host"];
    const vid = this.vanity(host);
    if (vid) {
      return {
        organization_url: `https://${vid}.edu`,
        site_name: `Co${vid}`,
        site_description: `Vanity: ${vid}`,
        theming: "yes",
        dns: host,
        commercial: "no",
        ssh_gateway: "no",
        organization_email: `contact@${vid}.edu`,
        organization_name: `Vanity University of ${vid}`,
        verify_emails: "yes",
        help_email: `help@${vid}.edu`,
        email_enabled: "yes",
        kucalc: "yes",
        allow_anonymous_sign_in: false,
      };
    } else {
      // the default
      return this.data.pub;
    }
  }
}
