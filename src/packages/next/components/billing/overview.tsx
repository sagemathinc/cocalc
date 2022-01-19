import A from "components/misc/A";

export default function Overview() {
  return (
    <div>
      <p>
        You can see and edit your{" "}
        <A href="/billing/payment-methods">your payment methods</A>, view or
        cancel <A href="/billing/subscriptions">your subscriptions</A>, and see{" "}
        <A href="/billing/invoices-and-receipts">your invoices and receipts</A>.
      </p>
      <p>
        You can also read{" "}
        <A href="https://doc.cocalc.com/account/purchases.html#subscription-list">
          the billing documentation
        </A>
        .
      </p>
    </div>
  );
}
