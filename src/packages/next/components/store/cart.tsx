import { useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Loading from "components/share/loading";
import { Alert, Button, Checkbox, Table } from "antd";
import { computeCost, DisplayCost } from "./site-license-cost";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { money } from "@cocalc/frontend/site-licenses/purchase/util";

export default function ShoppingCart() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const cart = useAPI("/shopping/cart/get");
  const items = useMemo(() => {
    if (!cart.result) return undefined;
    const x: any[] = [];
    const v: number[] = [];
    for (const item of cart.result) {
      item.cost = computeCost(item.description);
      x.push(item);
      v.push(item.id);
    }
    setSelected(new Set(v));
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
      dataIndex: "id",
      render: (id) => (
        <Checkbox
          checked={selected.has(id)}
          onChange={(e) => {
            const x = new Set(selected);
            if (e.target.checked) {
              x.add(id);
            } else {
              x.delete(id);
            }
            setSelected(x);
          }}
        />
      ),
    },
    {
      title: "Product",
      align: "center" as "center",
      render: () => (
        <div>
          <Icon name="key" style={{ fontSize: "48px" }} />
          <div style={{ fontSize: "14pt" }}>Site License</div>
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
          <TotalCost items={cart.result} selected={selected} />
        </div>
        <br />
        Includes a 25% self-service discount.
      </div>
    </div>
  );
}

function TotalCost({ items, selected }) {
  let discounted_cost = 0;
  let n = 0;
  for (const { cost, id } of items) {
    if (selected.has(id)) {
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
