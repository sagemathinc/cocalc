/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getStripePublishableKey } from "@cocalc/frontend/purchases/api";
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
  const key = await getStripePublishableKey();
  stripe = await loadStripe0(key);
  if (stripe == null) {
    throw Error("failed to initialized Stripe");
  }
  return stripe;
});
