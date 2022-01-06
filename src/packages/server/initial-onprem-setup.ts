/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
For on-prem setups, this initializes a few essential configurations automatically:

1. Make sure an admin account with a given email address exists.
   If it is created, initialize it with the given password.
   If there is already an account with that email address, it just makes sure it is part
   of the admin group (but no password reset).
2. If a registration token is set, make sure at least one sign up token exists.
   If there is already one (even if disabled!) don't touch it.
   Otherwise, if there is no token, create one with the given token string.
*/

import { callback2 as cb2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import passwordHash from "@cocalc/backend/auth/password-hash";
import { is_valid_email_address } from "@cocalc/util/misc";
import { query } from "@cocalc/database/postgres/query";
import registrationTokenQuery from "@cocalc/database/postgres/registration-tokens";
import getLogger from "@cocalc/backend/logger";
const L = getLogger("server:initial-onprem-setup");

// these are the names of the relevant environment variables
// the registration token to setup, only relevant if there is no token at all – otherwise no action
const REG_TOKEN = "COCALC_SETUP_REGISTRATION_TOKEN";
// valid email address and a password for an admin account. if account exists, password is left as it is, i.e. no reset.
const ADMIN_EMAIL = "COCALC_SETUP_ADMIN_EMAIL";
const ADMIN_PW = "COCALC_SETUP_ADMIN_PASSWORD";

function isSet(name: string): boolean {
  const val = process.env[name];
  return val != null && typeof val === "string" && val.length > 0;
}

export async function initialOnPremSetup(db: PostgreSQL): Promise<void> {
  if (db == null) {
    throw new Error("database unavailable -- aborting");
  }
  const s = new Setup(db);
  await s.setup();
}

class Setup {
  private db: PostgreSQL;
  constructor(db) {
    this.db = db;
  }
  async setup() {
    await this.setupAdmin();
    await this.setupRegToken();
  }

  async isAdmin(
    email_address
  ): Promise<{ exists: string | false; isAdmin: boolean }> {
    const account = await query({
      db: this.db,
      one: true,
      query: `SELECT account_id, groups FROM accounts WHERE email_address = $1`,
      params: [email_address],
    });
    const exists = account?.account_id ?? false;
    const groups = account?.groups ?? [];
    const isAdmin = groups.includes("admin");
    return { exists, isAdmin };
  }

  async setupAdmin() {
    if (!isSet(ADMIN_EMAIL) && !isSet(ADMIN_PW)) return;
    const email_address = process.env[ADMIN_EMAIL];
    if (email_address == null || !is_valid_email_address(email_address)) {
      throw new Error(`Email address '${email_address}' is invalid.`);
    }
    const { exists, isAdmin } = await this.isAdmin(email_address);
    if (exists === false) {
      L.info("Admin User Setup: creating user");
      const account_id = await this.createAdminUser(email_address);
      if (account_id == null) throw new Error(`Problem creating admin account`);
      this.makeAdmin(account_id);
    } else if (!isAdmin && typeof exists === "string") {
      L.info(`Admin User Setup: making user '${exists}' an admin`);
      await this.makeAdmin(exists);
    }
  }

  async makeAdmin(account_id: string) {
    await cb2(this.db.make_user_admin, { account_id });
  }

  async createAdminUser(email_address: string): Promise<string | undefined> {
    const pw = process.env[ADMIN_PW];
    if (pw == null || pw == "") throw new Error(`Password not set or empty`);
    return await cb2(this.db.create_account, {
      email_address,
      password_hash: passwordHash(pw),
      first_name: "Admin",
      last_name: email_address.split("@")[0],
    });
  }

  async setupRegToken() {
    const token = process.env[REG_TOKEN];
    if (token == null || !isSet(REG_TOKEN)) return;
    const tokens = await registrationTokenQuery(this.db, [], { token: "*" });
    if (tokens?.length > 0) return;
    L.info("creating registration token");
    await registrationTokenQuery(this.db, [], {
      token,
      descr: "Initial Setup",
    });
  }
}
