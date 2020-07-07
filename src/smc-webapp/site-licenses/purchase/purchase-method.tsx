/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Component that obtains a payment method for this user:

 - if one is already available, user can confirm that
 - if no payment method is available, they enter one
 - onClose is called with the method or null if user decides not to enter a method.

*/
import { Button } from "antd";

import {
  React,
  useActions,
  useAsyncEffect,
  useTypedRedux,
  useState,
} from "../../app-framework";
import { Loading } from "../../r_misc";
import { alert_message } from "../../alerts";
import { PaymentMethods } from "../../billing/payment-methods";

interface Props {
  onClose: (id: string | undefined) => void;
}

export const PurchaseMethod: React.FC<Props> = React.memo(({ onClose }) => {
  const customer = useTypedRedux("billing", "customer");
  const actions = useActions("billing");
  const [loaded, set_loaded] = useState<boolean>(false);

  useAsyncEffect(async (isMounted) => {
    // update billing info whenever component mounts
    try {
      await actions.update_customer();
    } catch (err) {
      alert_message({
        type: "error",
        message: `Problem loading customer info -- ${err}`,
      });
    }
    if (isMounted()) {
      set_loaded(true);
    }
  }, []);

  if (!loaded) {
    return <Loading />;
  }
  if (customer == null) {
    return <div>Billing not available</div>;
  }

  const source = customer.get("default_source");
  return (
    <div>
      <PaymentMethods
        sources={customer.get("sources")?.toJS()}
        default={customer.get("default_source")}
      />
      {source && (
        <Button onClick={() => onClose(source)}>
          Use default method
        </Button>
      )}
    </div>
  );
});
