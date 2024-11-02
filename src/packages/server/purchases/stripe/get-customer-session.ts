/*
When using stripe **Elements** to update an unfinished payment, e.g.,
add card info, this api call grants access to an additional secret
that enables showing previously entered credit card info, so the
user can much more easily finish their payment.

This is not needed for stripe **Checkout**.  It's only
needed for **Elements**, which we have to use for updating
an unfinished purchase, since checkout doesn't do that.

See https://docs.stripe.com/api/customer_sessions
*/

import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId } from "./util";
import type { CustomerSessionSecret } from "@cocalc/util/stripe/types";

const logger = getLogger("purchases:stripe:get-customer-session");

export default async function getCustomerSession(
  account_id,
): Promise<CustomerSessionSecret> {
  logger.debug("getCustomerSession", {
    account_id,
  });

  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  logger.debug("getCustomerSession", { customer });
  const stripe = await getConn();

  const customerSession = await stripe.customerSessions.create({
    customer,
    components: {
      payment_element: {
        enabled: true,
        features: {
          payment_method_redisplay: "enabled",
          payment_method_remove: "enabled",
        },
      },
    },
  });

  return { customerSessionClientSecret: customerSession.client_secret };
}
