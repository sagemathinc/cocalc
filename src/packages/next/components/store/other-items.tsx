/*
The "Saved for Later" section below the shopping cart.
*/

import { useEffect, useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import apiPost from "lib/api/post";
import useIsMounted from "lib/hooks/mounted";
import { Alert, Button, Input, Menu, Row, Col, Table } from "antd";
import { computeCost, DisplayCost, describeItem } from "./site-license-cost";
import Loading from "components/share/loading";
import { Icon } from "@cocalc/frontend/components/icon";
import { search_split, search_match } from "@cocalc/util/misc";

type Tab = "saved-for-later" | "buy-it-again";

interface Props {
  onChange: () => void;
  cart: { result: any }; // returned by useAPI; used to track when it updates.
}

export default function OtherItems({ onChange, cart }) {
  const [tab, setTab] = useState<Tab>("saved-for-later");
  const [search, setSearch] = useState<string>("");
  return (
    <div>
      <Row>
        <Col sm={18} xs={24}>
          <Menu
            selectedKeys={[tab]}
            mode="horizontal"
            onSelect={(e) => {
              setTab(e.keyPath[0] as Tab);
            }}
          >
            <Menu.Item key={"saved-for-later" as Tab}>
              Saved For Later
            </Menu.Item>
            <Menu.Item key={"buy-it-again" as Tab}>Buy It Again</Menu.Item>
          </Menu>
        </Col>
        <Col sm={6}>
          <div
            style={{
              height: "100%",
              borderBottom: "1px solid #eee" /* hack to match menu */,
              display: "flex",
              flexDirection: "column",
              alignContent: "center",
              justifyContent: "center",
              paddingRight: "5px",
            }}
          >
            <Input.Search
              style={{ width: "100%" }}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Col>
      </Row>
      <Items
        onChange={onChange}
        cart={cart}
        tab={tab}
        search={search.toLowerCase()}
      />
    </div>
  );
}

interface ItemsProps extends Props {
  tab: Tab;
  search: string;
}

function Items({ onChange, cart, tab, search }: ItemsProps) {
  const isMounted = useIsMounted();
  const [updating, setUpdating] = useState<boolean>(false);
  const get = useAPI(
    "/shopping/cart/get",
    tab == "buy-it-again" ? { purchased: true } : { removed: true }
  );
  const items = useMemo(() => {
    if (!get.result) return undefined;
    const x: any[] = [];
    const v = search_split(search);
    for (const item of get.result) {
      if (search && !search_match(JSON.stringify(item).toLowerCase(), v))
        continue;
      item.cost = computeCost(item.description);
      x.push(item);
    }
    return x;
  }, [get.result, search]);

  useEffect(() => {
    get.call();
  }, [cart.result]);

  if (get.error) {
    return <Alert type="error" message={get.error} />;
  }
  if (get.result == null || items == null) {
    return <Loading center />;
  }

  async function reload() {
    if (!isMounted.current) return;
    setUpdating(true);
    try {
      await get.call();
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
          ? `No ${search ? "matching" : ""} previously purchased items.`
          : `No ${search ? "matching" : ""} items saved for later.`}
      </div>
    );
  }

  const columns = [
    {
      responsive: ["xs" as "xs"],
      render: ({ id, cost, description }) => {
        return (
          <div>
            <DescriptionColumn
              {...{
                id,
                cost,
                description,
                updating,
                setUpdating,
                isMounted,
                reload,
                onChange,
                tab,
              }}
            />
            <div>
              <b style={{ fontSize: "11pt" }}>
                <DisplayCost cost={cost} simple oneLine />
              </b>
            </div>
          </div>
        );
      },
    },
    {
      responsive: ["sm" as "sm"],
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
      responsive: ["sm" as "sm"],
      width: "60%",
      render: (_, { id, cost, description }) => (
        <DescriptionColumn
          {...{
            id,
            cost,
            description,
            updating,
            setUpdating,
            isMounted,
            onChange,
            reload,
            tab,
          }}
        />
      ),
    },
    {
      responsive: ["sm" as "sm"],
      title: "Price",
      align: "right" as "right",
      render: (_, { cost }) => (
        <b style={{ fontSize: "11pt" }}>
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

function DescriptionColumn({
  id,
  cost,
  description,
  updating,
  setUpdating,
  isMounted,
  onChange,
  reload,
  tab,
}) {
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
        {describeItem(input)}
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
}
