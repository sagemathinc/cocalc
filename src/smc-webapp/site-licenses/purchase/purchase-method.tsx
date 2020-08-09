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
import { Icon, Loading, Space } from "../../r_misc";
import { alert_message } from "../../alerts";
import { PaymentMethods } from "../../billing/payment-methods";

interface Props {
  onClose: (id: string | undefined) => void;
  amount: string; // amount formated as a currency
  description: string;
}

export const PurchaseMethod: React.FC<Props> = React.memo(
  ({ amount, description, onClose }) => {
    const customer = useTypedRedux("billing", "customer");
    const actions = useActions("billing");
    const [loaded, set_loaded] = useState<boolean>(false);
    const [buy_confirm, set_buy_confirm] = useState<boolean>(false);

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
      return <Loading theme="medium" />;
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
          <Button
            disabled={buy_confirm}
            type={!buy_confirm ? "primary" : undefined}
            size="large"
            onClick={() => set_buy_confirm(true)}
          >
            <Icon name="check" /> <Space /> <Space /> Checkout...
          </Button>
        )}
        {source && buy_confirm && (
          <div style={{ marginTop: "5px" }}>
            <Button type="primary" size="large" onClick={() => onClose(source)}>
              <Icon name="credit-card" /> <Space /> <Space /> Charge the default
              card {amount} plus any applicable tax for {description}.
            </Button>
          </div>
        )}
      </div>
    );
  }
);
