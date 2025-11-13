import { Divider } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";

export default function Help() {
  return (
    <>
      <Divider orientation="left" style={{ width: "600px" }}>
        <A href="https://doc.cocalc.com/vouchers.html">
          <Icon name="medkit" /> Vouchers
        </A>{" "}
      </Divider>
      <div
        style={{
          color: "#666",
          maxWidth: "600px",
        }}
      >
        <p>
          When a voucher code is redeemed,{" "}
          <A href="/settings/purchases" external>
            credit
          </A>{" "}
          will be added to the account. Use this{" "}
          <A href="/settings/purchases" external>
            credit
          </A>{" "}
          to make purchases.
        </p>
        If you have any questions, <A href="/support">contact support</A>, visit{" "}
        <A href="/vouchers">the Voucher Center</A>, or{" "}
        <A href="https://doc.cocalc.com/vouchers.html">read the docs</A>.
      </div>
    </>
  );
}
