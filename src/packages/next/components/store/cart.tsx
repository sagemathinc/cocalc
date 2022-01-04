/*
Shopping cart.

The UX is similar to Amazon.com, since that's probably the single most popular
shopping cart experience, so most likely to feel familiar to users and easy
to use.
*/

import { useMemo } from "react";
import useAPI from "lib/hooks/api";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Loading from "components/share/loading";
import { Alert, Button, Checkbox, Table } from "antd";
import { computeCost, DisplayCost } from "./site-license-cost";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { money } from "@cocalc/frontend/site-licenses/purchase/util";

export default function ShoppingCart() {
  const cart = useAPI("/shopping/cart/get");
  const items = useMemo(() => {
    if (!cart.result) return undefined;
    const x: any[] = [];
    for (const item of cart.result) {
      item.cost = computeCost(item.description);
      x.push(item);
    }
    return x;
  }, [cart.result]);

  if (cart.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!items) {
    return <Loading />;
  }

  const columns = [
    {
      title: "",
      render: (_, { id, checked }) => (
        <Checkbox
          checked={checked}
          onChange={async (e) => {
            await apiPost("/shopping/cart/checked", {
              id,
              checked: e.target.checked,
            });
            await cart.call();
          }}
        />
      ),
    },
    {
      title: "Product",
      align: "center" as "center",
      render: () => (
        <div>
          <Icon name="key" style={{ fontSize: "24px" }} />
          <div style={{ fontSize: "10pt" }}>Site License</div>
        </div>
      ),
    },
    {
      width: "60%",
      render: (_, { cost, description }) => {
        const { input } = cost;
        return (
          <>
            {describe_quota({
              ram: input.custom_ram,
              cpu: input.custom_cpu,
              disk: input.custom_disk,
              always_running: input.custom_always_running,
              member: input.custom_member,
              user: input.user,
            })}{" "}
            for up to {description.runLimit} simultaneous running projects.
          </>
        );
      },
    },
    {
      title: "Price",
      align: "right" as "right",
      render: (_, { cost }) => (
        <b style={{ fontSize: "12pt" }}>
          <DisplayCost cost={cost} simple />
        </b>
      ),
    },
  ];

  return (
    <div>
      <div style={{ float: "right", marginBottom: "15px" }}>
        <Button size="large" type="primary" href="/store/checkout">
          Proceed to Checkout
        </Button>
      </div>
      <h3>
        <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} /> Shopping
        Cart
      </h3>
      <div style={{ marginTop: "-10px", marginBottom: "5px" }}>
        <SelectAllItems
          items={items}
          onChange={async () => await cart.call()}
        />
      </div>
      <Table
        columns={columns}
        dataSource={items}
        rowKey={"id"}
        pagination={{ hideOnSinglePage: true }}
      />
      <div
        style={{ float: "right", fontSize: "12pt", margin: "15px 15px 0 0" }}
      >
        <div style={{ float: "right" }}>
          <TotalCost items={cart.result} />
        </div>
        <br />
        Includes a 25% self-service discount.
      </div>
    </div>
  );
}

function TotalCost({ items }) {
  let discounted_cost = 0;
  let n = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      discounted_cost += cost.discounted_cost;
      n += 1;
    }
  }
  return (
    <>
      Subtotal ({n} items): <b>{money(discounted_cost)}</b>
    </>
  );
}

function SelectAllItems({ items, onChange }) {
  const numSelected = useMemo(() => {
    let n = 0;
    if (items == null) return n;
    for (const item of items) {
      if (item.checked) n += 1;
    }
    return n;
  }, [items]);
  if (items == null) return null;

  async function doSelectAll(checked: boolean) {
    await apiPost("/shopping/cart/checked", { checked });
    onChange();
  }

  if (numSelected == 0) {
    return (
      <>
        No items selected.{" "}
        <a onClick={() => doSelectAll(true)}>Select all items</a>
      </>
    );
  }
  if (numSelected < items.length) {
    return <a onClick={() => doSelectAll(true)}>Select all items</a>;
  }
  return <a onClick={() => doSelectAll(false)}>Deselect all items</a>;
}
