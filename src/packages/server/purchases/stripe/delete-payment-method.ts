import getConn from "@cocalc/server/stripe/connection";

export default async function deletePaymentMethod({
  payment_method,
}: {
  payment_method: string;
}) {
  const stripe = await getConn();
  // note -- we don't actually check the user has this payment method.
  await stripe.paymentMethods.detach(payment_method);
}
