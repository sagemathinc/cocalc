/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { AddToCartButton } from "./add-box";
import { DisplayCost } from "./site-license-cost";

interface Props {
  show: boolean;
  cost: CostInputPeriod | undefined;
  router: any;
  form: any;
  cartError: string | undefined;
  setCartError: (error) => void;
}

// this is like a minimal "add box"
export const InfoBar: React.FC<Props> = (props: Props) => {
  const { show, cost, router, form, cartError, setCartError } = props;

  if (!show) return null;

  function renderInfoBarContent() {
    if (!cost) return null;
    // if any of the fields in cost that start with the string "cost" are NaN, return null
    if (Object.keys(cost).some((k) => k.startsWith("cost") && isNaN(cost[k]))) {
      return null;
    }
    return (
      <>
        Cost:{" "}
        <span style={{ fontWeight: "bold", paddingRight: "10px" }}>
          <DisplayCost
            cost={cost}
            oneLine={true}
            simple={true}
            showDiscount={false}
          />
        </span>
        <AddToCartButton
          cartError={cartError}
          cost={cost}
          form={form}
          router={router}
          setCartError={setCartError}
          variant={"small"}
        />
      </>
    );
  }

  // this is a thin bar at the top, fixed position and height
  return (
    <div
      style={{
        height: 50,
        display: "flex", // we want to align the content at the bottom
        backgroundColor: "white",
        position: "fixed",
        textAlign: "right",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: "10px",
        boxShadow: "0 3px 4px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          alignSelf: "center",
          flex: 1,
          fontSize: "125%",
          whiteSpace: "nowrap",
        }}
      >
        {renderInfoBarContent()}
      </div>
    </div>
  );
};
