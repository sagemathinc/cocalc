/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Client account creation and deletion
*/

const MAX_ACCOUNTS_PER_30MIN = 150;
const MAX_ACCOUNTS_PER_30MIN_GOLD = 1500;

const auth = require("../auth");
import { parseDomain, ParseResultType } from "parse-domain";
import * as message from "smc-util/message";
import { CreateAccount } from "smc-util/message-types";
import {
  walltime,
  lower_email_address,
  required,
  defaults,
  is_valid_email_address,
  len,
} from "smc-util/misc";
import { delay } from "awaiting";
import { callback2 } from "smc-util/async-utils";
import { PostgreSQL } from "../postgres/types";
const { api_key_action } = require("../api/manage");
import {
  get_server_settings,
  have_active_registration_tokens,
  get_passports,
} from "../utils";
import { getLogger } from "smc-hub/logger";

const winston = getLogger("create-account");

export function is_valid_password(password: string) {
  if (typeof password !== "string") {
    return [false, "Password must be specified."];
  }
  if (password.length >= 6 && password.length <= 64) {
    return [true, ""];
  } else {
    return [false, "Password must be between 6 and 64 characters in length."];
  }
}

function issues_with_create_account(mesg) {
  const issues: any = {};
  if (mesg.email_address && !is_valid_email_address(mesg.email_address)) {
    issues.email_address = "Email address does not appear to be valid.";
  }
  if (mesg.password) {
    const [valid, reason] = is_valid_password(mesg.password);
    if (!valid) {
      issues.password = reason;
    }
  }
  return issues;
}

async function get_db_client(db: PostgreSQL) {
  const t0 = new Date().getTime();
  while (new Date().getTime() - t0 < 10 * 1000) {
    const client = db._client();
    if (client != null) {
      return client;
    } else {
      await delay(100);
    }
  }
  throw new Error("Unable to get a database client");
}

// if the email address's domain should go through SSO, return the domain name
async function is_domain_exclusive_sso(
  db: PostgreSQL,
  email?: string
): Promise<string | undefined> {
  if (email == null) return undefined;
  const raw_domain = email.split("@")[1]?.trim().toLowerCase();
  if (raw_domain == null) return;
  const parsed = parseDomain(raw_domain);
  const passports = await get_passports(db);

  const blocked = new Set<string>([]);
  for (const pp of passports) {
    for (const domain of pp.conf.exclusive_domains ?? []) {
      blocked.add(domain);
    }
  }
  if (parsed.type == ParseResultType.Listed) {
    const { domain, topLevelDomains } = parsed;
    const canonical = [domain ?? "", ...topLevelDomains].join(".");
    if (blocked.has(canonical)) {
      return canonical;
    }
  }
}

// return true if allowed to continue creating an account (either no token required or token matches)
async function check_registration_token(
  db: PostgreSQL,
  token: string | undefined
): Promise<string | undefined> {
  const have_tokens = await have_active_registration_tokens(db);

  // if there are no tokens set, it's ok
  if (!have_tokens) return;

  if (token == null || token == "") {
    return "No registration token provided";
  }

  // since we check the counter against the limit, we have to wrap this in a transaction
  // otherwise there is a chance to increase the counter above the limit
  const client = await get_db_client(db);

  try {
    await client.query("BEGIN");

    // overview: first, we check if the token matches.
    // → check if it is disabled?
    // → check expiration date → abort if expired
    // → if counter, check counter vs. limit
    //   → true: increase the counter → ok
    //   → false: ok
    const q_match = `SELECT "expires", "counter", "limit", "disabled"
                     FROM registration_tokens
                     WHERE token = $1::TEXT
                     FOR UPDATE`;
    const match = await client.query(q_match, [token]);

    if (match.rows.length != 1) {
      return "Registration token is wrong.";
    }
    // e.g. { expires: 2020-12-04T11:54:52.889Z, counter: null, limit: 10, disabled: ... }
    const {
      expires,
      counter: counter_raw,
      limit,
      disabled: disabled_raw,
    } = match.rows[0];
    const counter = counter_raw ?? 0;
    const disabled = disabled_raw ?? false;

    if (disabled) {
      return "Registration token disabled.";
    }

    if (expires != null && expires.getTime() < new Date().getTime()) {
      return "Registration token no longer valid.";
    }

    // we count in any case, but only enforce the limit if there is actually a limit set
    if (limit != null && limit <= counter) {
      return "Registration token used up.";
    } else {
      // increase counter
      const q_inc = `UPDATE registration_tokens SET "counter" = coalesce("counter", 0) + 1
                     WHERE token = $1::TEXT`;
      await client.query(q_inc, [token]);
    }

    // all good, let's commit
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

interface AccountCreationOptions {
  client: any;
  mesg: CreateAccount;
  database: PostgreSQL;
  host?: string;
  port?: number;
  sign_in?: boolean; // if true, the newly created user will also be signed in; only makes sense for browser clients!
}

interface CreateAccountData {
  account_id: string;
  first_name: string;
  last_name: string;
  email_address?: string;
  created_by: string;
  analytics_token?: string;
}

// This should not actually throw in case of trouble, but instead send
// error directly to the client.
export async function create_account(
  opts: AccountCreationOptions
): Promise<void> {
  // we still use defaults/required due to coffeescript client.
  opts = defaults(opts, {
    client: required,
    mesg: required,
    database: required,
    host: undefined,
    port: undefined,
    sign_in: false, // if true, the newly created user will also be signed in; only makes sense for browser clients!
  });
  const id: string = opts.mesg.id;
  let mesg1: { [key: string]: any };
  winston.info(
    `create_account ${opts.mesg.first_name} ${opts.mesg.last_name} ${opts.mesg.email_address}`
  );
  function dbg(m): void {
    winston.debug(`create_account (${opts.mesg.email_address}): ${m}`);
  }

  const tm = walltime();
  if (opts.mesg.email_address != null) {
    opts.mesg.email_address = lower_email_address(opts.mesg.email_address);
  }

  let account_id: string = "";

  async function createAccount() {
    dbg("run tests on generic validity of input");

    // check if we even allow account creating via email/password
    const settings = await get_server_settings(opts.database);
    if (!settings.email_signup) {
      return { other: "Signing up via email/password is disabled." };
    }

    // issues_with_create_account also does check is_valid_password!
    const issues = issues_with_create_account(opts.mesg);

    // TODO -- only uncomment this for easy testing to allow any password choice.
    // the client test suite will then fail, which is good, so we are reminded
    // to comment this out before release!
    // delete issues['password']

    if (len(issues) > 0) {
      return issues;
    }

    // Make sure this ip address hasn't requested too many accounts recently,
    // just to avoid really nasty abuse, but still allow for demo registration
    // behind a single router.
    dbg("make sure not too many accounts were created from the given ip");
    const n = await callback2(opts.database.count_accounts_created_by, {
      ip_address: opts.client.ip_address,
      age_s: 60 * 30,
    });
    if (n >= MAX_ACCOUNTS_PER_30MIN) {
      let m = MAX_ACCOUNTS_PER_30MIN;

      // Check if account is being created via API by a "gold" user.
      if (
        opts.client.account_id != null &&
        (await callback2(opts.database.user_is_in_group, {
          account_id: opts.client.account_id,
          group: "gold",
        }))
      ) {
        m = MAX_ACCOUNTS_PER_30MIN_GOLD;
      }

      if (n >= m) {
        return {
          other: `Too many accounts are being created from the ip address ${opts.client.ip_address}; try again later.  By default at most ${m} accounts can be created every 30 minutes from one IP; if you're using the API and need a higher limit, contact us.`,
        };
      }
    }

    if (opts.mesg.email_address) {
      dbg("query database to determine whether the email address is available");

      const not_available = await callback2(opts.database.account_exists, {
        email_address: opts.mesg.email_address,
      });
      if (not_available) {
        return { email_address: "This e-mail address is already taken." };
      }

      dbg("check that account is not banned");
      const is_banned = await callback2(opts.database.is_banned_user, {
        email_address: opts.mesg.email_address,
      });
      if (is_banned) {
        return { email_address: "This e-mail address is banned." };
      }
    }

    dbg("check if a registration token is required");
    const check_token = await check_registration_token(
      opts.database,
      opts.mesg.token
    );
    if (check_token) {
      return { token: check_token };
    }

    dbg("check if email domain has to go through an SSO mechanism");
    const check_domain = await is_domain_exclusive_sso(
      opts.database,
      opts.mesg.email_address
    );
    if (check_domain != null) {
      return {
        email_address: `To sign up with "@${check_domain}", you have to use the corresponding SSO connect mechanism listed above!`,
      };
    }

    dbg("create new account");
    account_id = await callback2(opts.database.create_account, {
      first_name: opts.mesg.first_name,
      last_name: opts.mesg.last_name,
      email_address: opts.mesg.email_address,
      password_hash: opts.mesg.password
        ? auth.password_hash(opts.mesg.password)
        : undefined,
      created_by: opts.client.ip_address,
      usage_intent: opts.mesg.usage_intent,
    });

    if (opts.mesg.token != null) {
      // we also record that we used a registration token ...
      await callback2(opts.database.log, {
        event: "create_account_registration_token",
        value: { token: opts.mesg.token, account_id },
      });
    }

    // log to database
    const data: CreateAccountData = {
      account_id,
      first_name: opts.mesg.first_name,
      last_name: opts.mesg.last_name,
      email_address: opts.mesg.email_address,
      created_by: opts.client.ip_address,
    };

    await callback2(opts.database.log, {
      event: "create_account",
      value: data,
    });

    if (opts.mesg.email_address) {
      dbg("check for any account creation actions");
      // do not block
      await callback2(opts.database.do_account_creation_actions, {
        email_address: opts.mesg.email_address,
        account_id,
      });
    }

    if (opts.sign_in) {
      dbg("set remember_me cookie...");
      // so that proxy server will allow user to connect and
      // download images, etc., the very first time right after they make a new account.
      await callback2(opts.client.remember_me, {
        account_id,
      });
      dbg(
        `send message back to user that they are logged in as the new user (in ${walltime(
          tm
        )}seconds)`
      );
      // no analytics token is logged, because it is already done in the create_account entry above.
      mesg1 = message.signed_in({
        id,
        account_id,
        email_address: opts.mesg.email_address,
        first_name: opts.mesg.first_name,
        last_name: opts.mesg.last_name,
        remember_me: false,
        hub: opts.host + ":" + opts.port,
      });
      opts.client.signed_in(mesg1); // records this creation in database...
    } else {
      mesg1 = message.account_created({ id, account_id });
    }

    if (opts.mesg.email_address != null) {
      try {
        dbg("send email verification request");
        await callback2(auth.verify_email_send_token, {
          account_id,
          database: opts.database,
        });
      } catch (err) {
        // We make this nonfatal since email might just be misconfigured,
        // and we don't want that to completely break account creation.
        dbg(`WARNING -- error sending email verification (non-fatal): ${err}`);
      }
    }

    if (opts.mesg.get_api_key) {
      dbg("get_api_key -- generate key and include in response message");
      mesg1.api_key = await callback2(api_key_action, {
        database: opts.database,
        account_id,
        password: opts.mesg.password,
        action: "regenerate",
      });
    }

    opts.client.push_to_client(mesg1);
  }

  const reason = await createAccount();
  if (reason) {
    // IMPORTANT: There are various settings where the user simply never sees
    // this, since they aren't setup to listen for it...
    dbg(
      `send message to user that there was an error (in ${walltime(
        tm
      )}seconds) -- ${JSON.stringify(reason)}`
    );
    opts.client.push_to_client(message.account_creation_failed({ id, reason }));
  }
}

interface DeleteAccountOptions {
  client?: any;
  mesg?: any;
  database: PostgreSQL;
}

// This should not actually throw in case of trouble, but instead send
// error directly to the client.
export async function delete_account(
  opts: DeleteAccountOptions
): Promise<void> {
  opts = defaults(opts, {
    client: undefined,
    mesg: required,
    database: required,
  });
  winston.info(`delete_account("${opts.mesg.account_id}")`);

  let error: any = undefined;
  try {
    await callback2(opts.database.mark_account_deleted, {
      account_id: opts.mesg.account_id,
    });
  } catch (err) {
    error = err;
  }
  if (opts.client != null) {
    opts.client.push_to_client(
      message.account_deleted({ id: opts.mesg.id, error })
    );
  }
}
