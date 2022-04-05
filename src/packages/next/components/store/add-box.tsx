/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { ProductDescription } from "@cocalc/util/db-schema/shopping-cart-items";
import { money } from "@cocalc/util/licenses/purchase/util";
import { Alert, Button } from "antd";
import apiPost from "lib/api/post";
import { DisplayCost } from "./site-license-cost";

export function AddBox({ cost, router, form, cartError, setCartError }) {
  if (!cost) return null;

  async function addToCart() {
    const description: ProductDescription & { type?: string } =
      form.getFieldsValue(true);

    // unload the type parameter
    switch (description.type) {
      case "regular":
        description.boost = false;
        break;
      case "boost":
        description.boost = true;
        break;
      default:
        setCartError(`Invalid license type: "${description.type}"`);
        return;
    }

    // and done
    delete description.type;

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
        <div>
          {money(cost.discounted_cost / cost.input.quantity)} per project
        </div>
        <div style={{ textAlign: "center" }}>
          {router.query.id != null && (
            <Button
              size="large"
              style={{ marginRight: "5px" }}
              onClick={() => router.push("/store/cart")}
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
            disabled={cost.cost === 0}
          >
            {router.query.id != null ? "Save Changes" : "Add to Cart"}
          </Button>
          {cartError && <Alert type="error" message={cartError} />}
        </div>
      </div>
    </div>
  );
}
