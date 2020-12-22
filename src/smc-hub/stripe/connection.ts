/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The stripe connection object, which communicates with the remote stripe server.

Configure via the admin panel in account settings of an admin user.
*/

import Stripe from "stripe";
// STOPGAP FIX: relative dirs necessary for manage service
import { callback2 } from "../../smc-util/async-utils";

// See https://stripe.com/docs/api/versioning
const apiVersion = "2020-03-02";

// Return the stripe api object if it has been initialized (via init_stripe below), or
// undefined if it has not yet been initialized.
let stripe: Stripe | undefined = undefined;
export function get_stripe(): Stripe | undefined {
  return stripe;
}

// init_stripe: call this to ensure that the stripe library
// and key, etc., is available to other functions.  Additional
// calls after initialization are ignored.
//
// TODO: this could listen to a changefeed on the database
// for changes to the server_settings table... but maybe that is overkill.
export async function init_stripe(database, logger?: any): Promise<Stripe> {
  if (database == null) {
    throw Error("init_stripe: first arg must be a database");
  }
  const dbg = (m) => {
    logger?.debug(`init_stripe: ${m}`); // Codemirror Javascript mode is broken :-(   --> `
  };
  if (stripe != null) {
    dbg("already done");
    return stripe;
  }

  const secret_key = await callback2(database.get_server_setting, {
    name: "stripe_secret_key",
  });
  if (secret_key) {
    dbg("got stripe secret_key");
  } else {
    dbg("WARNING: empty secret_key -- things won't work");
  }
  stripe = new Stripe(secret_key, { apiVersion });

  const value = await callback2(database.get_server_setting, {
    name: "stripe_publishable_key",
  });
  dbg(`stripe_publishable_key: ${value}`);
  (stripe as any).publishable_key = value;
  return stripe;
}
