/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Add a cash voucher to your shopping cart.
*/
import { useState, type JSX } from "react";
import { Alert, Button, Spin } from "antd";

import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { round2up } from "@cocalc/util/misc";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { addToCart } from "./add-to-cart";
import { DisplayCost } from "./site-license-cost";
import { periodicCost } from "@cocalc/util/licenses/purchase/compute-cost";
import { decimalDivide } from "@cocalc/util/stripe/calc";

import type { LicenseSource } from "@cocalc/util/upgrades/shopping";

export const ADD_STYLE = {
  display: "inline-block",
  maxWidth: "550px",
  minWidth: "400px",
  background: "#fafafa",
  border: "1px solid #ccc",
  padding: "10px 20px",
  borderRadius: "5px",
  margin: "15px 0",
  fontSize: "12pt",
} as const;

interface Props {
  cost?: CostInputPeriod;
  router;
  form;
  cartError: string | undefined;
  setCartError: (error) => void;
  dedicatedItem?: boolean;
  disabled?: boolean;
  noAccount: boolean;
  source: LicenseSource;
}

export function AddBox({
  cost,
  router,
  form,
  cartError,
  setCartError,
  dedicatedItem = false,
  noAccount,
  disabled = false,
  source,
}: Props) {
  if (cost?.input.type == "cash-voucher") {
    return null;
  }
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
    if (dedicatedItem || cost.input.quantity == null) {
      return;
    }
    const costPer = decimalDivide(periodicCost(cost), cost.input.quantity);
    return (
      <Alert
        type="warning"
        style={{
          margin: "10px",
        }}
        message={
          <>
            {money(round2up(costPer))}{" "}
            <b>per {source === "course" ? "student" : "project"}</b>{" "}
            {!!cost.period && cost.period != "range" ? cost.period : ""}
          </>
        }
      />
    );
  }

  function renderButton(): JSX.Element | null {
    if (noAccount) return null;

    return (
      <div style={{ textAlign: "center", marginTop: "5px" }}>
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
      <div style={ADD_STYLE}>
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

export function AddToCartButton({
  cost,
  form,
  router,
  setCartError,
  cartError,
  variant = "primary",
  disabled: disabled0,
}: CartButtonProps) {
  const [clicked, setClicked] = useState<boolean>(false);
  const disabled =
    clicked ||
    (disabled0 ?? false) ||
    !!cartError ||
    cost == null ||
    cost.cost === 0;

  return (
    <Button
      size={variant === "small" ? "small" : "large"}
      type="primary"
      htmlType="submit"
      onClick={async () => {
        // you can only click this add to cart button *once* -- due to slow
        // turnaround, if we don't change this state, then the user could
        // click multiple times and add the same item more than once, thus
        // accidentally ending up with a "dobule purchase"
        try {
          setClicked(true);
          await addToCart({ form, setCartError, router });
        } catch (_err) {
          // error is reported via setCartError.  But also
          // give a chance to click the button again, since item
          // wasn't actually added.
          setClicked(false);
        }
      }}
      disabled={disabled}
    >
      {clicked
        ? "Moving to Cart..."
        : router.query.id != null
        ? "Save Changes"
        : "Add to Cart"}
      {clicked && <Spin style={{ marginLeft: "15px" }} />}
    </Button>
  );
}
