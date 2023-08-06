/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Add a cash voucher to your shopping cart.
*/
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { Alert, Button } from "antd";
import { addToCart } from "./add-to-cart";
import { DisplayCost } from "./site-license-cost";

interface Props {
  cost?: CostInputPeriod;
  router;
  form;
  cartError: string | undefined;
  setCartError: (error) => void;
  dedicatedItem?: boolean;
  disabled?: boolean;
  noAccount: boolean;
}

export function AddBox(props: Props) {
  const {
    cost,
    router,
    form,
    cartError,
    setCartError,
    dedicatedItem = false,
    noAccount,
  } = props;
  if (cost?.input.type == "cash-voucher") {
    return null;
  }
  let disabled = props.disabled ?? false;
  // if any of the fields in cost that start with the string "cost" are NaN, disable submission:
  if (
    !cost ||
    Object.keys(cost).some((k) => k.startsWith("cost") && isNaN(cost[k]))
  ) {
    disabled = true;
  }

  function costPerProject() {
    if (cost?.input.type != "quota") {
      return;
    }
    if (dedicatedItem || cost.input.quantity == null) return;
    return (
      <div>{money(cost.discounted_cost / cost.input.quantity)} per project</div>
    );
  }

  function renderButton(): JSX.Element | null {
    if (noAccount) return null;

    return (
      <div style={{ textAlign: "center" }}>
        {router.query.id != null && (
          <Button
            size="large"
            style={{ marginRight: "5px" }}
            onClick={() => router.push("/store/cart")}
            disabled={disabled}
          >
            Cancel
          </Button>
        )}
        <AddToCartButton
          cartError={cartError}
          cost={cost}
          disabled={disabled}
          form={form}
          router={router}
          setCartError={setCartError}
        />
        {cartError && <Alert type="error" message={cartError} />}
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          maxWidth: "400px",
          background: "white",
          border: "1px solid #ccc",
          padding: "10px 20px",
          borderRadius: "5px",
          margin: "15px 0",
          fontSize: "12pt",
        }}
      >
        {cost && <DisplayCost cost={cost} />}
        {cost && costPerProject()}
        {renderButton()}
      </div>
    </div>
  );
}

interface CartButtonProps {
  cost: CostInputPeriod | undefined;
  router;
  form;
  setCartError: (error) => void;
  disabled?: boolean;
  cartError: string | undefined;
  variant?: "primary" | "small";
}

export function AddToCartButton(props: CartButtonProps) {
  const {
    cost,
    form,
    router,
    setCartError,
    cartError,
    variant = "primary",
  } = props;

  const style = variant === "primary" ? { marginTop: "5px" } : {};
  const disabled =
    (props.disabled ?? false) || !!cartError || cost == null || cost.cost === 0;

  return (
    <Button
      size={variant === "small" ? "small" : "large"}
      type="primary"
      htmlType="submit"
      style={style}
      onClick={() => addToCart({ form, setCartError, router })}
      disabled={disabled}
    >
      {disabled
        ? "Finish configuring the license..."
        : router.query.id != null
        ? "Save Changes"
        : "Add to Cart"}
    </Button>
  );
}
