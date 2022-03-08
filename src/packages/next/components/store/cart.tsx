/*
Shopping cart.

The UX is similar to Amazon.com, since that's probably the single most popular
shopping cart experience, so most likely to feel familiar to users and easy
to use.
*/

import { useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Loading from "components/share/loading";
import A from "components/misc/A";
import { Alert, Button, Checkbox, Popconfirm, Table } from "antd";
import { EditRunLimit } from "./site-license";
import {
  computeCost,
  DisplayCost,
  describeItem,
  describePeriod,
} from "./site-license-cost";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { money } from "@cocalc/util/licenses/purchase/util";
import SiteName from "components/share/site-name";
import useIsMounted from "lib/hooks/mounted";
import { capitalize, plural } from "@cocalc/util/misc";
import { useRouter } from "next/router";
import OtherItems from "./other-items";
import { untangleUptime } from "@cocalc/util/consts/site-license";

export default function ShoppingCart() {
  const isMounted = useIsMounted();
  const [updating, setUpdating] = useState<boolean>(false);
  const [subTotal, setSubTotal] = useState<number>(0);
  const cart = useAPI("/shopping/cart/get");
  const items = useMemo(() => {
    if (!cart.result) return undefined;
    // TODO deal with errors returned by useAPI
    if (cart.result.error != null) return undefined;
    const x: any[] = [];
    let subTotal = 0;
    for (const item of cart.result) {
      item.cost = computeCost(item.description);
      if (item.checked) {
        subTotal += item.cost.discounted_cost;
      }
      x.push(item);
    }
    setSubTotal(subTotal);
    return x;
  }, [cart.result]);

  if (cart.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!items) {
    return <Loading center />;
  }

  async function reload() {
    if (!isMounted.current) return;
    setUpdating(true);
    try {
      await cart.call();
    } finally {
      if (isMounted.current) {
        setUpdating(false);
      }
    }
  }

  const columns = [
    {
      responsive: ["xs" as "xs"],
      render: ({ id, checked, cost, description }) => {
        return (
          <div>
            <CheckboxColumn
              {...{ id, checked, updating, setUpdating, isMounted, reload }}
            />
            <DescriptionColumn
              {...{
                id,
                cost,
                description,
                updating,
                setUpdating,
                isMounted,
                reload,
              }}
              compact
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
      title: "",
      render: (_, { id, checked }) => (
        <CheckboxColumn
          {...{ id, checked, updating, setUpdating, isMounted, reload }}
        />
      ),
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
            reload,
          }}
          compact={false}
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
    <div style={{ maxWidth: "900px", margin: "auto" }}>
      {items.length == 0 && (
        <>
          <h3>
            <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} /> Your{" "}
            <SiteName /> Shopping Cart is Empty
          </h3>
          <A href="/store/site-license">Buy a License</A>
        </>
      )}
      {items.length > 0 && (
        <>
          {" "}
          <div style={{ float: "right", marginBottom: "15px" }}>
            <span style={{ fontSize: "13pt" }}>
              <TotalCost items={items} />
            </span>
            <A href="/store/checkout">
              <Button
                disabled={subTotal == 0 || updating}
                style={{ marginLeft: "15px" }}
                size="large"
                type="primary"
              >
                Proceed to Checkout
              </Button>
            </A>
          </div>
          <h3>
            <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} />{" "}
            Shopping Cart
          </h3>
          <div style={{ marginTop: "-10px", marginBottom: "5px" }}>
            <SelectAllItems items={items} onChange={reload} />
          </div>
          <div style={{ border: "1px solid #eee" }}>
            <Table
              showHeader={false}
              columns={columns}
              dataSource={items}
              rowKey={"id"}
              pagination={{ hideOnSinglePage: true }}
            />
          </div>
          <div
            style={{
              float: "right",
              fontSize: "12pt",
              margin: "15px 15px 0 0",
            }}
          >
            <div style={{ float: "right" }}>
              <TotalCost items={cart.result} />
            </div>
            <br />
          </div>
        </>
      )}

      <div
        style={{
          marginTop: "60px",
          border: "1px solid #eee",
        }}
      >
        <OtherItems onChange={reload} cart={cart} />
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
  if (n == 0) {
    return <>No items selected</>;
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

function CheckboxColumn({
  id,
  checked,
  updating,
  setUpdating,
  isMounted,
  reload,
}) {
  return (
    <Checkbox
      disabled={updating}
      checked={checked}
      onChange={async (e) => {
        setUpdating(true);
        try {
          await apiPost("/shopping/cart/checked", {
            id,
            checked: e.target.checked,
          });
          if (!isMounted.current) return;
          await reload();
        } finally {
          if (!isMounted.current) return;
          setUpdating(false);
        }
      }}
    >
      <span className="sr-only">Select</span>
    </Checkbox>
  );
}

function DescriptionColumn({
  id,
  cost,
  description,
  updating,
  setUpdating,
  isMounted,
  reload,
  compact,
}) {
  const router = useRouter();
  const { input } = cost;
  const [editRunLimit, setEditRunLimit] = useState<boolean>(false);
  const [runLimit, setRunLimit] = useState<number>(description.run_limit);
  const { idle_timeout, always_running } = untangleUptime(input.custom_uptime);

  function editableQuota() {
    return (
      <div>
        <div>
          {describe_quota({
            ram: input.custom_ram,
            cpu: input.custom_cpu,
            disk: input.custom_disk,
            always_running,
            idle_timeout,
            member: input.custom_member,
            user: input.user,
          })}
          {!editRunLimit && (
            <>
              {" "}
              <Button
                onClick={() => setEditRunLimit(true)}
                disabled={updating}
                style={{ marginBottom: "5px" }}
              >
                {runLimit} simultaneous running {plural(runLimit, "project")}
              </Button>
            </>
          )}
        </div>
        <div>
          {editRunLimit && (
            <div
              style={{
                border: "1px solid #eee",
                padding: "15px",
                margin: "15px 0",
                background: "white",
              }}
            >
              <Icon
                name="times"
                style={{ float: "right" }}
                onClick={() => {
                  setEditRunLimit(false);
                }}
              />
              <EditRunLimit value={runLimit} onChange={setRunLimit} />
              <Button
                type="primary"
                style={{ marginTop: "15px" }}
                onClick={async () => {
                  setEditRunLimit(false);
                  await apiPost("/shopping/cart/edit", {
                    id,
                    description: { ...description, run_limit: runLimit },
                  });
                  await reload();
                }}
              >
                Save
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: "12pt" }}>
        {description.title && (
          <div>
            <b>{description.title}</b>
          </div>
        )}
        {description.description && <div>{description.description}</div>}
        <div>
          <b>
            {input.subscription == "no"
              ? describePeriod(input)
              : capitalize(input.subscription) + " subscription"}
          </b>
        </div>
        <div
          style={{
            border: "1px solid lightblue",
            background: "white",
            padding: "15px 15px 5px 15px",
            margin: "5px 0 10px 0",
            borderRadius: "5px",
          }}
        >
          {compact ? describeItem(input) : editableQuota()}{" "}
        </div>
        <Button
          style={{ marginRight: "5px" }}
          onClick={() => router.push(`/store/site-license?id=${id}`)}
        >
          <Icon name="pencil" /> Edit
        </Button>
        <Button
          style={{ margin: "0 5px 5px 0" }}
          disabled={updating}
          onClick={async () => {
            setUpdating(true);
            try {
              await apiPost("/shopping/cart/remove", { id });
              if (!isMounted.current) return;
              await reload();
            } finally {
              if (!isMounted.current) return;
              setUpdating(false);
            }
          }}
        >
          <Icon name="save" /> Save for later
        </Button>
        <Popconfirm
          title={"Are you sure you want to delete this item?"}
          onConfirm={async () => {
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
          okText={"Yes, delete this item"}
          cancelText={"Cancel"}
        >
          <Button disabled={updating} type="dashed">
            <Icon name="trash" /> Delete
          </Button>
        </Popconfirm>
      </div>
    </>
  );
}
