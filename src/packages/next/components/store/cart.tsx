import useAPI from "lib/hooks/api";
import { Icon } from "@cocalc/frontend/components/icon";
import Loading from "components/share/loading";
import { Alert, Checkbox, Table } from "antd";
import { computeCost, DisplayCost } from "./site-license-cost";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";

export default function ShoppingCart() {
  const cart = useAPI("/shopping/cart/get");
  if (cart.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!cart.result) {
    return <Loading />;
  }

  const columns = [
    { title: "", render: () => <Checkbox checked /> },

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
      render: (_, item) => {
        const cost = computeCost(item.description);
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
            for up to {item.description.runLimit} simultaneous running projects.
          </>
        );
      },
    },
    {
      title: "Price",
      align: "right" as "right",
      render: (_, item) => (
        <b style={{ fontSize: "12pt" }}>
          <DisplayCost cost={computeCost(item.description)} simple />
        </b>
      ),
    },
  ];

  return (
    <div>
      <h3>
        <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} /> Shopping
        Cart
      </h3>
      <Table
        columns={columns}
        dataSource={cart.result}
        rowKey={"id"}
        pagination={{ hideOnSinglePage: true }}
      />
    </div>
  );
}
