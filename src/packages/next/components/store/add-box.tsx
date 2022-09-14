/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { Alert, Button } from "antd";
import { addToCart } from "./add-to-cart";
import { DisplayCost } from "./site-license-cost";

interface Props {
  cost?: CostInputPeriod;
  router: any;
  form: any;
  cartError: string | undefined;
  setCartError: (error) => void;
  dedicatedItem?: boolean;
  disabled?: boolean;
}

export function AddBox(props: Props) {
  const {
    cost,
    router,
    form,
    cartError,
    setCartError,
    dedicatedItem = false,
    disabled = false,
  } = props;

  if (!cost) return null;
  // if any of the fields in cost that start with the string "cost" are NaN, return null
  if (Object.keys(cost).some((k) => k.startsWith("cost") && isNaN(cost[k]))) {
    return null;
  }

  function costPerProject() {
    if (!cost) throw new Error(`cost is undefined, should not happen.`);
    if (!["quota", "regular", "boost"].includes(cost.input.type as string)) {
      return;
    }
    if (dedicatedItem || cost.input.quantity == null) return;
    return (
      <div>
        {money(cost.discounted_cost_cents / cost.input.quantity)} per project
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
        <DisplayCost cost={cost} />
        {costPerProject()}
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
      </div>
    </div>
  );
}

interface CartButtonProps {
  cost: CostInputPeriod | undefined;
  router: any;
  form: any;
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
    disabled = false,
    cartError,
    variant = "primary",
  } = props;

  const style = variant === "primary" ? { marginTop: "5px" } : {};

  return (
    <Button
      size={variant === "small" ? "small" : "large"}
      type="primary"
      htmlType="submit"
      style={style}
      onClick={() => addToCart({ form, setCartError, router })}
      disabled={
        disabled || !!cartError || cost == null || cost.cost_cents === 0
      }
    >
      {router.query.id != null ? "Save Changes" : "Add to Cart"}
    </Button>
  );
}
