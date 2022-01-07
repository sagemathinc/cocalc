/*
The "Saved for Later" section below the shopping cart.
*/

import { useEffect, useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import apiPost from "lib/api/post";
import useIsMounted from "lib/hooks/mounted";
import { Alert, Button, Menu, Table } from "antd";
import { computeCost, DisplayCost } from "./site-license-cost";
import Loading from "components/share/loading";
import { Icon } from "@cocalc/frontend/components/icon";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { plural } from "@cocalc/util/misc";

type Tab = "saved-for-later" | "buy-it-again";

interface Props {
  onChange: () => void;
  cart: { result: any }; // returned by useAPI; used to track when it updates.
}

export default function OtherItems({ onChange, cart }) {
  const [tab, setTab] = useState<Tab>("saved-for-later");
  return (
    <div>
      <Menu
        selectedKeys={[tab]}
        mode="horizontal"
        onSelect={(e) => {
          setTab(e.keyPath[0] as Tab);
        }}
      >
        <Menu.Item key={"saved-for-later" as Tab}>Saved For Later</Menu.Item>
        <Menu.Item key={"buy-it-again" as Tab}>Buy It Again</Menu.Item>
      </Menu>
      <div style={{ marginBottom: "15px" }} />
      <Items onChange={onChange} cart={cart} tab={tab} />
    </div>
  );
}

interface ItemsProps extends Props {
  tab: Tab;
}

function Items({ onChange, cart, tab }: ItemsProps) {
  const isMounted = useIsMounted();
  const [updating, setUpdating] = useState<boolean>(false);
  const saved = useAPI(
    "/shopping/cart/get",
    tab == "buy-it-again" ? { purchased: true } : { removed: true }
  );
  const items = useMemo(() => {
    if (!saved.result) return undefined;
    const x: any[] = [];
    for (const item of saved.result) {
      item.cost = computeCost(item.description);
      x.push(item);
    }
    return x;
  }, [saved.result]);

  useEffect(() => {
    saved.call();
  }, [cart.result]);

  if (saved.error) {
    return <Alert type="error" message={saved.error} />;
  }
  if (saved.result == null || items == null) {
    return <Loading center />;
  }

  async function reload() {
    if (!isMounted.current) return;
    setUpdating(true);
    try {
      await saved.call();
    } finally {
      if (isMounted.current) {
        setUpdating(false);
      }
    }
  }

  if (items.length == 0) {
    return (
      <div style={{ padding: "15px", textAlign: "center", fontSize: "10pt" }}>
        {tab == "buy-it-again"
          ? "No previously purchased items."
          : "No items saved for later."}
      </div>
    );
  }

  const columns = [
    {
      title: "Product",
      align: "center" as "center",
      render: () => (
        <div style={{ color: "darkblue" }}>
          <Icon name="key" style={{ fontSize: "24px" }} />
          <div style={{ fontSize: "10pt" }}>Site License</div>
        </div>
      ),
    },
    {
      width: "60%",
      render: (_, { id, cost, description }) => {
        const { input } = cost;
        return (
          <>
            <div style={{ fontSize: "12pt" }}>
              {description.title && (
                <div>
                  <b>{description.title}</b>
                </div>
              )}
              {description.description && <div>{description.description}</div>}
              {describe_quota({
                ram: input.custom_ram,
                cpu: input.custom_cpu,
                disk: input.custom_disk,
                always_running: input.custom_always_running,
                member: input.custom_member,
                user: input.user,
              })}
              <span>
                {" "}
                to up to {description.runLimit} simultaneous running{" "}
                {plural(description.runLimit, "project")}
              </span>
            </div>
            <div style={{ marginTop: "5px" }}>
              <Button
                disabled={updating}
                onClick={async () => {
                  setUpdating(true);
                  try {
                    await apiPost("/shopping/cart/add", {
                      id,
                      purchased: tab == "buy-it-again",
                    });
                    if (!isMounted.current) return;
                    onChange();
                    await reload();
                  } finally {
                    if (!isMounted.current) return;
                    setUpdating(false);
                  }
                }}
              >
                <Icon name="shopping-cart" />{" "}
                {tab == "buy-it-again" ? "Add to Cart" : "Move to Cart"}
              </Button>
              {tab == "saved-for-later" && (
                <Button
                  disabled={updating}
                  type="dashed"
                  style={{ margin: "0 5px" }}
                  onClick={async () => {
                    setUpdating(true);
                    try {
                      await apiPost("/shopping/cart/delete", { id });
                      if (!isMounted.current) return;
                      await reload();
                    } finally {
                      if (!isMounted.current) return;
                      setUpdating(false);
                    }
                  }}
                >
                  <Icon name="trash" /> Delete
                </Button>
              )}
            </div>
          </>
        );
      },
    },
    {
      title: "Price",
      align: "right" as "right",
      render: (_, { cost }) => (
        <b style={{ fontSize: "13pt" }}>
          <DisplayCost cost={cost} simple />
        </b>
      ),
    },
  ];

  return (
    <Table
      showHeader={false}
      columns={columns}
      dataSource={items}
      rowKey={"id"}
      pagination={{ hideOnSinglePage: true }}
    />
  );
}
