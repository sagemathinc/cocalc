import { callback } from "awaiting";
import { redux } from "../app-framework";
import { BillingStore } from "./store";

export interface Stripe {
  elements: Function;
  createToken: Function;
}

export interface StripeCard {
  mount: Function;
}

let stripe: Stripe | undefined = undefined;
export async function load_stripe(): Promise<Stripe> {
  if (stripe != null) return stripe;
  function f(cb: Function) {
    (window as any).$.getScript("https://js.stripe.com/v3/")
      .done(cb)
      .fail(() =>
        cb(
          "Unable to load Stripe payment support; make sure your browser is not blocking https://js.stripe.com/v3/"
        )
      );
  }
  await callback(f);
  const store : BillingStore = redux.getStore("billing");
  if (store == null) {
    throw Error("billing store not initialized");
  }
  const key: string | undefined = store.get("stripe_publishable_key");
  if (!key) {
    throw Error("stripe not configured -- publishable key not known");
  }
  return (stripe = (window as any).Stripe(key));
}
