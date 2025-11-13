/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getStripePublishableKey } from "@cocalc/frontend/purchases/api";
//import { loadStripe as loadStripe0, type Stripe } from "@stripe/stripe-js";
import { type Stripe } from "@stripe/stripe-js";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export interface StripeCard {
  mount: Function;
}

let stripe: Stripe | null = null;
export const loadStripe = reuseInFlight(async (): Promise<Stripe> => {
  if (stripe != null) {
    return stripe;
  }
  // load only when actually used, since this involves dynamic load over the internet to stripe.com,
  // and we don't want loading cocalc in an airgapped network to have hung network requests.
  const { loadStripe: loadStripe0 } = await import("@stripe/stripe-js");
  const key = await getStripePublishableKey();
  stripe = await loadStripe0(key);
  if (stripe == null) {
    throw Error("failed to initialized Stripe");
  }
  return stripe;
});
