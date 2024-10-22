/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "../app-framework";
import { BillingStore } from "./store";
import { loadStripe as loadStripe0, type Stripe } from "@stripe/stripe-js";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export interface StripeCard {
  mount: Function;
}

let stripe: Stripe | null = null;
export const loadStripe = reuseInFlight(async (): Promise<Stripe> => {
  if (stripe != null) {
    return stripe;
  }
  const actions = redux.getActions('billing');
  await actions.update_customer();
  const store: BillingStore = redux.getStore("billing");
  if (store == null) {
    throw Error("billing store not initialized");
  }
  const key: string | undefined = store.get("stripe_publishable_key");
  if (!key) {
    throw Error("Stripe not configured -- publishable key not known");
  }
  stripe = await loadStripe0(key);
  if (stripe == null) {
    throw Error("failed to initialized Stripe");
  }
  return stripe;
});
