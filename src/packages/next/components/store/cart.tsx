/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shopping cart.

The UX is similar to Amazon.com, since that's probably the single most popular
shopping cart experience, so most likely to feel familiar to users and easy
to use.
*/

import { Alert, Button, Checkbox, Popconfirm, Table } from "antd";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type JSX } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import type {
  ProductDescription,
  ProductType,
} from "@cocalc/util/db-schema/shopping-cart-items";
import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { capitalize, isValidUUID } from "@cocalc/util/misc";
import { WORKSPACE_LABEL } from "@cocalc/util/i18n/terminology";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import useAPI from "lib/hooks/api";
import useIsMounted from "lib/hooks/mounted";
import OtherItems from "./other-items";
import { describeItem, describePeriod, DisplayCost } from "./site-license-cost";

export default function ShoppingCart() {
  const isMounted = useIsMounted();
  const [updating, setUpdating] = useState<boolean>(false);
  const [numChecked, setNumChecked] = useState<number>(0);
  const router = useRouter();

  // most likely, user will checkout next
  useEffect(() => {
    router.prefetch("/store/checkout");
  }, []);

  const cart = useAPI("/shopping/cart/get");

  const items = useMemo(() => {
    if (!cart.result) return undefined;
    // TODO deal with errors returned by useAPI
    if (cart.result.error != null) return undefined;
    const x: any[] = [];
    let numChecked = 0;
    for (const item of cart.result) {
      try {
        if (item.product == "membership") {
          item.cost = membershipCostFromDescription(item.description);
        } else {
          item.cost = computeCost(item.description);
        }
      } catch (err) {
        // sadly computeCost is buggy, or rather - it crashes because of other bugs.
        // It's much better to
        // have something not in the cart and an error than to make the cart and
        // store just be 100% broken
        // forever for a user!
        // That said, I've fixed every bug I could find and tested things, so hopefully
        // this doesn't come up.
        console.warn("Invalid item in cart -- not showing", item);
        continue;
      }
      if (item.checked) {
        numChecked += 1;
      }
      x.push(item);
    }
    setNumChecked(numChecked);
    return x;
  }, [cart.result]);

  if (cart.error) {
    return <Alert type="error" message={cart.error} />;
  }

  if (!items) {
    return <Loading large center />;
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
      render: ({
        id,
        product,
        checked,
        cost,
        description,
        type,
        project_id,
      }) => {
        return (
          <div>
            <CheckboxColumn
              {...{ id, checked, updating, setUpdating, isMounted, reload }}
            />
            <DescriptionColumn
              {...{
                product,
                id,
                cost,
                description,
                updating,
                setUpdating,
                isMounted,
                reload,
                type,
                project_id,
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
      render: (_, { product }) => <ProductColumn product={product} />,
    },
    {
      responsive: ["sm" as "sm"],
      width: "60%",
      render: (_, { product, id, cost, description, type, project_id }) => (
        <DescriptionColumn
          {...{
            product,
            id,
            cost,
            description,
            updating,
            setUpdating,
            isMounted,
            reload,
            type,
            project_id,
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

  function noItems() {
    return (
      <>
        <h3>
          <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} /> Your{" "}
          <SiteName /> Shopping Cart is Empty
        </h3>
        <A href="/store/membership">Buy a Membership</A>
      </>
    );
  }

  function renderItems() {
    return (
      <>
        <div style={{ float: "right" }}>
          <Button
            disabled={numChecked == 0 || updating}
            size="large"
            type="primary"
            onClick={() => {
              router.push("/store/checkout");
            }}
          >
            Proceed to Checkout
          </Button>
        </div>
        <h3>
          <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} />{" "}
          Shopping Cart
        </h3>
        <div style={{ marginTop: "-10px" }}>
          <SelectAllItems items={items} onChange={reload} />
          <Button
            type="link"
            style={{ marginLeft: "15px" }}
            onClick={() => router.push("/store")}
          >
            Continue Shopping
          </Button>
        </div>
        <div style={{ border: "1px solid #eee", marginTop: "15px" }}>
          <Table
            showHeader={false}
            columns={columns}
            dataSource={items}
            rowKey={"id"}
            pagination={{ hideOnSinglePage: true }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {items.length == 0 && noItems()}
      {items.length > 0 && renderItems()}

      <div
        style={{
          marginTop: "60px",
          border: "1px solid #eee",
        }}
      >
        <OtherItems onChange={reload} cart={cart} />
      </div>
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
        <Button type="primary" onClick={() => doSelectAll(true)}>
          Select all items
        </Button>
      </>
    );
  }
  if (numSelected < items.length) {
    return (
      <Button type="link" onClick={() => doSelectAll(true)}>
        Select all items
      </Button>
    );
  }
  return (
    <Button type="link" onClick={() => doSelectAll(false)}>
      Deselect all items
    </Button>
  );
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

interface DCProps {
  product: ProductType;
  id: string;
  cost: CostInputPeriod;
  description: ProductDescription;
  updating: boolean;
  setUpdating: (u: boolean) => void;
  isMounted: { current: boolean };
  reload: () => void;
  compact: boolean;
  project_id?: string;
  readOnly?: boolean; // if true, don't show any buttons
  style?;
}

const DESCRIPTION_STYLE = {
  border: "1px solid lightblue",
  background: "white",
  padding: "15px",
  margin: "5px 0 10px 0",
  borderRadius: "5px",
} as const;

// Also used externally for showing what a voucher is for in next/pages/vouchers/[id].tsx
export function DescriptionColumn(props: DCProps) {
  const router = useRouter();
  const { id, description, style, readOnly } = props;
  if (description.type === "quota") {
    return <DescriptionColumnSiteLicense {...props} />;
  } else if (description.type == "membership") {
    return (
      <div style={style}>
        <b style={{ fontSize: "12pt" }}>
          Membership: {capitalize(description.class)}
        </b>
        <div style={DESCRIPTION_STYLE}>
          {description.interval == "month" ? "Monthly" : "Yearly"} membership
          subscription.
        </div>
        {!readOnly && (
          <>
            <SaveForLater {...props} />
            <DeleteItem {...props} />
          </>
        )}
      </div>
    );
  } else if (description.type == "cash-voucher") {
    return (
      <div style={style}>
        <b style={{ fontSize: "12pt" }}>Cash Voucher: {description.title}</b>
        <div style={DESCRIPTION_STYLE}>
          {describeItem({ info: description })}
        </div>
        {!readOnly && (
          <>
            <Button
              style={{ marginRight: "5px" }}
              onClick={() => {
                router.push(`/store/vouchers?id=${id}`);
              }}
            >
              <Icon name="pencil" /> Edit
            </Button>
            <SaveForLater {...props} />
            <DeleteItem {...props} />
          </>
        )}
      </div>
    );
  } else {
    return <pre>{JSON.stringify(description, undefined, 2)}</pre>;
  }
}

function DescriptionColumnSiteLicense(props: DCProps) {
  const { id, cost, description, compact, project_id, readOnly } = props;
  if (!(description.type === "quota")) {
    throw Error("BUG -- incorrect typing");
  }
  const router = useRouter();
  if (cost == null) {
    // don't crash when used on deprecated items
    return <pre>{JSON.stringify(description, undefined, 2)}</pre>;
  }
  const { input } = cost;
  if (input.type === "cash-voucher") {
    throw Error("incorrect typing");
  }

  function renderProjectID(): JSX.Element | null {
    if (!project_id || !isValidUUID(project_id)) return null;
    return (
      <Alert
        type="info"
        banner={true}
        message={
          <>
            For {WORKSPACE_LABEL.toLowerCase()}: <code>{project_id}</code>
          </>
        }
      />
    );
  }

  function editableQuota() {
    if (input.type === "cash-voucher") return null;
    return (
      <div>
        <div>{describeQuotaFromInfo(input)}</div>
        {renderProjectID()}
      </div>
    );
  }

  // this could rely an the "type" field, but we rather check the data directly
  function editPage(): "site-license" | "vouchers" | "course" {
    if (input.type === "cash-voucher") {
      return "vouchers";
    } else if (
      description.type === "quota" &&
      description.source === "course"
    ) {
      return "course";
    }
    return "site-license";
  }

  return (
    <div style={{ fontSize: "12pt" }}>
      {description.title && (
        <div>
          <b>{description.title}</b>
        </div>
      )}
      {description.description && <div>{description.description}</div>}
      <div style={DESCRIPTION_STYLE}>
        <div style={{ marginBottom: "8px" }}>
          <b>
            {input.subscription === "no"
              ? describePeriod({ quota: input })
              : capitalize(input.subscription) + " subscription"}
          </b>
        </div>
        {compact || readOnly ? describeItem({ info: input }) : editableQuota()}{" "}
      </div>
      {!readOnly && (
        <>
          <Button
            style={{ marginRight: "5px" }}
            onClick={() => {
              const page = editPage();
              router.push(`/store/${page}?id=${id}`);
            }}
          >
            <Icon name="pencil" /> Edit
          </Button>
          <SaveForLater {...props} />
          <DeleteItem {...props} />
        </>
      )}
    </div>
  );
}

function SaveForLater({ id, reload, updating, setUpdating, isMounted }) {
  return (
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
  );
}

function DeleteItem({ id, reload, updating, setUpdating, isMounted }) {
  return (
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
  );
}

const PRODUCTS = {
  "site-license": { icon: "key", label: "License" },
  "cash-voucher": { icon: "money", label: "Cash Voucher" },
  membership: { icon: "user", label: "Membership" },
};

export function ProductColumn({ product }) {
  const { icon, label } = PRODUCTS[product] ?? {
    icon: "check",
    label: "Unknown",
  };
  return (
    <div style={{ color: "darkblue" }}>
      <Icon name={icon} style={{ fontSize: "24px" }} />
      <div style={{ fontSize: "10pt" }}>{label}</div>
    </div>
  );
}

function membershipCostFromDescription(description: ProductDescription): CostInputPeriod {
  if (description?.type != "membership") {
    throw Error("invalid membership description");
  }
  const price = description.price ?? 0;
  const monthly = description.interval == "month" ? price : price / 12;
  const yearly = description.interval == "year" ? price : price * 12;
  const period = description.interval == "month" ? "monthly" : "yearly";
  return {
    cost: price,
    cost_per_unit: price,
    cost_per_project_per_month: monthly,
    cost_sub_month: monthly,
    cost_sub_year: yearly,
    cost_sub_first_period: price,
    quantity: 1,
    period,
    input: {
      type: "cash-voucher",
      amount: price,
      subscription: period,
    },
  };
}
