import { useState } from "react";
import { Button, Card, InputNumber, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import { currency } from "@cocalc/util/misc";
import apiPost from "lib/api/post";

interface Props {
  onAdd: () => void;
  defaultExpand?: boolean;
  style?;
}

export default function AddCashVoucher({ onAdd, defaultExpand, style }: Props) {
  const [expand, setExpand] = useState<boolean>(!!defaultExpand);
  const [amount, setAmount] = useState<number>(5);

  if (!expand) {
    return (
      <Button style={style} onClick={() => setExpand(!expand)}>
        Add Cash Voucher...
      </Button>
    );
  }

  const disabled = !amount;
  const addVoucher = async () => {
    if (disabled) return;
    await apiPost("/shopping/cart/add", {
      product: "cash-voucher",
      description: { type: "cash-voucher", amount },
    });
    onAdd();
  };

  return (
    <Card
      title={
        <>
          Add Cash Voucher{" "}
          {!defaultExpand && (
            <Button
              style={{ marginLeft: "30px" }}
              onClick={() => setExpand(false)}
            >
              Close
            </Button>
          )}
        </>
      }
      style={{ margin: "15px 0", ...style }}
    >
      <Space>
        <InputNumber
          min={0}
          max={9999}
          defaultValue={amount}
          onChange={(value) => setAmount(value ?? 0)}
          precision={2} // for two decimal places
          step={5}
          addonAfter="$"
          addonBefore="Amount (USD)"
        />
        <Button
          onClick={() => {
            addVoucher();
            if (!defaultExpand) {
              setExpand(false);
            }
          }}
          disabled={disabled}
          type="primary"
        >
          <Icon name="shopping-cart" /> Add to Cart
        </Button>
      </Space>
      <p style={{ marginTop: "15px", color: "#666" }}>
        When the recipient <A href="redeem">redeems</A> a cash voucher code,
        their <SiteName /> account will be credited for {currency(amount)}. They
        can then buy anything from the store or make pay-as-you-go purchases
        using this credit. They can also make a new voucher to transfer money
        back. You can track whether or not any voucher code has been redeemed,
        and redeem unused vouchers yourself if you do not want to use them.
      </p>
    </Card>
  );
}
