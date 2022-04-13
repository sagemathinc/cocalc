/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { ProductDescription } from "@cocalc/util/db-schema/shopping-cart-items";
import { money } from "@cocalc/util/licenses/purchase/util";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { Alert, Button } from "antd";
import apiPost from "lib/api/post";
import { Cost, DisplayCost } from "./site-license-cost";

export type LicenseType = "regular" | "boost" | "vm" | "disk";

interface Props {
  cost?: Cost;
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

  async function addToCart() {
    const description: ProductDescription & { type?: LicenseType } =
      form.getFieldsValue(true);

    // unload the type parameter
    switch (description.type) {
      case "boost":
        description.boost = true;
        break;
      case "vm":
        for (const k of ["disk-name", "disk-size_gb", "disk-speed"]) {
          delete description[k];
        }
        description.type = "vm";
        break;
      case "disk":
        console.log(description);
        delete description["vm-machine"];

        const diskID = `${description["disk-size_gb"]}-${description["disk-speed"]}`;
        const disk = PRICES.disks[diskID];
        if (disk == null) {
          setCartError(`Disk ${diskID} not found`);
          return;
        }
        description.dedicated_disk = {
          ...disk.quota.dedicated_disk,
          name: description["disk-name"],
        };
        for (const k of ["disk-name", "disk-size_gb", "disk-speed"]) {
          delete description[k];
        }
        break;
      case "regular":
      default:
        description.boost = false;
        description.type = "regular";
    }

    try {
      setCartError("");
      if (router.query.id != null) {
        await apiPost("/shopping/cart/edit", {
          id: router.query.id,
          description,
        });
      } else {
        await apiPost("/shopping/cart/add", {
          product: "site-license",
          description,
        });
      }
      router.push("/store/cart");
    } catch (err) {
      setCartError(err.message);
    }
  }

  function costPerProject() {
    if (!cost) throw new Error(`cost is undefined, should not happen.`);
    if (dedicatedItem || cost.input.quantity == null) return;
    return (
      <div>{money(cost.discounted_cost / cost.input.quantity)} per project</div>
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
          <Button
            size="large"
            type="primary"
            htmlType="submit"
            style={{ marginTop: "5px" }}
            onClick={() => addToCart()}
            disabled={!!cartError || cost.cost === 0 || disabled}
          >
            {router.query.id != null ? "Save Changes" : "Add to Cart"}
          </Button>
          {cartError && <Alert type="error" message={cartError} />}
        </div>
      </div>
    </div>
  );
}
