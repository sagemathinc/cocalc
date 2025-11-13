/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { Flex, Typography } from "antd";
import { MAX_WIDTH } from "lib/config";
import { AddToCartButton } from "./add-box";
import { describeItem, DisplayCost } from "./site-license-cost";
// import { NAVBAR_HEIGHT_PX } from "../landing/header";
const { Text } = Typography;

const INNER_STYLE: React.CSSProperties = {
  paddingRight: "10px",
};

interface Props {
  show: boolean;
  cost: CostInputPeriod | undefined;
  router: any;
  form: any;
  cartError: string | undefined;
  setCartError: (error) => void;
  noAccount: boolean;
}

// this is like a minimal "add box"
export const InfoBar: React.FC<Props> = (props: Props) => {
  const { show, cost, router, form, cartError, setCartError, noAccount } =
    props;

  if (!show) return null;

  function renderInfoBarContent() {
    if (cost?.input.type == "cash-voucher") return null;
    // if any of the fields in cost that start with the string "cost" are NaN, return null
    const disabled =
      !cost ||
      Object.keys(cost).some((k) => k.startsWith("cost") && isNaN(cost[k]));
    return (
      <>
        {disabled ? (
          <Text type="secondary" italic={true} style={INNER_STYLE}>
            License is not fully configured.
          </Text>
        ) : (
          <>
            <>{describeItem({ info: cost.input, variant: "short" })}: </>
            <Text strong={true} style={INNER_STYLE}>
              <DisplayCost
                cost={cost}
                oneLine={true}
                simple={true}
                simpleShowPeriod={false}
                discountTooltip={true}
              />
            </Text>
          </>
        )}
        {!noAccount && (
          <AddToCartButton
            cartError={cartError}
            cost={cost}
            form={form}
            router={router}
            setCartError={setCartError}
            variant={"small"}
            disabled={disabled}
          />
        )}
      </>
    );
  }

  // this is a thin bar at the top, fixed position and height
  // the width limit of the inner div is the same as for the div
  // inside the "Content", i.e. the form itself, such that everything
  // alignes nicely.
  return (
    <Flex
      style={{
        minHeight: "30px",
        display: "flex", // we want to align the content at the bottom
        backgroundColor: "white",
        position: "fixed",
        textAlign: "right",
        // top: `${NAVBAR_HEIGHT_PX}px`,
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: "8px",
        boxShadow: "0 4px 4px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: MAX_WIDTH,
          marginLeft: "auto",
          marginRight: "auto",
          alignSelf: "center",
          flex: 1,
          // whiteSpace: "nowrap",
        }}
      >
        {renderInfoBarContent()}
      </div>
    </Flex>
  );
};
