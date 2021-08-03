/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../app-framework";
import { BillingStore } from "./store";

declare global {
  interface Window {
    Stripe: any;
  }
}

declare var $: any;

export interface Stripe {
  elements: Function;
  createToken: Function;
}

export interface StripeCard {
  mount: Function;
}

let stripe: Stripe | undefined = undefined;
export async function loadStripe(): Promise<Stripe> {
  if (stripe != null) return stripe;
  try {
    await $.getScript("https://js.stripe.com/v3/");
  } catch (err) {
    throw Error(
      `Unable to load Stripe payment support; make sure your browser is not blocking https://js.stripe.com/v3/ -- ${err}`
    );
  }
  const store: BillingStore = redux.getStore("billing");
  if (store == null) {
    throw Error("billing store not initialized");
  }
  const key: string | undefined = store.get("stripe_publishable_key");
  if (!key) {
    throw Error("stripe not configured -- publishable key not known");
  }
  return (stripe = window.Stripe(key));
}
