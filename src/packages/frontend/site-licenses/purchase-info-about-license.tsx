/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useEffect, useTypedRedux } from "../app-framework";
import { Subscription } from "../billing/subscription";

interface Props {
  license_id: string;
}
export const LicensePurchaseInfo: React.FC<Props> = ({ license_id }) => {
  const customer = useTypedRedux("billing", "customer");
  const billing = useActions("billing");

  useEffect(() => {
    if (customer == null) {
      billing.update_customer();
    }
  }, []);
  if (!customer) return <></>;

  const subs = customer.getIn(["subscriptions", "data"]);
  if (subs == null || subs.size == 0) return <></>;
  for (const sub of subs) {
    if (sub.getIn(["metadata", "license_id"]) == license_id) {
      return (
        <li>
          <Subscription
            subscription={sub.toJS()}
            style={{
              background: "white",
              padding: "5px",
              border: "1px solid lightgrey",
              marginBottom: "5px",
              borderRadius: "3px",
            }}
          />
        </li>
      );
    }
  }
  return <></>;
};
