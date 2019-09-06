// TODO: @j3, I bet you could do a way, way better version of this file!

import { callback } from "awaiting";

export interface StripeAPI {
  setPublishableKey: (string) => void;
  card: any;
}

export async function load_stripe(): Promise<StripeAPI> {
  let { Stripe } = window as any;
  if (Stripe != null) return Stripe;
  function f(cb: Function) {
    (window as any).$.getScript("https://js.stripe.com/v2/") // TODO: ugh; old and terrible.
      .done(cb)
      .fail(() =>
        cb(
          "Unable to load Stripe support; make sure your browser is not blocking stripe.com."
        )
      );
  }
  await callback(f);
  Stripe = (window as any).Stripe;
  if (Stripe == null) throw Error("Error loading Stripe API.");
  return Stripe;
}

export async function callback_stripe(f: Function, ...args): Promise<any> {
  function wrapper(cb: Function) {
    f(...args, (status, response) => {
      if (status !== 200) {
        cb(response.error.message);
      } else {
        cb(undefined, response);
      }
    });
  }
  return callback(wrapper);
}
