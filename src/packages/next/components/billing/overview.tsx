/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import A from "components/misc/A";

export default function Overview() {
  return (
    <div>
      <p>
        You can see and edit your{" "}
        <A href="/billing/cards">your payment methods</A>, view or cancel{" "}
        <A href="/billing/subscriptions">your subscriptions</A>, and see{" "}
        <A href="/billing/receipts">your invoices and receipts</A>.
      </p>
      <p>
        You can also <A href="/store/site-license">buy a license</A> at{" "}
        <A href="/store">the store</A> and{" "}
        <A href="/licenses/managed">browse your existing licenses</A>.
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
