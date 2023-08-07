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
          When a voucher code is redeeemed,{" "}
          <A href="/settings/purchases" external>
            money
          </A>{" "}
          or{" "}
          <A href="/settings/licenses" external>
            licenses
          </A>{" "}
          will be added to the account. Use the corresponding{" "}
          <A href="/settings/purchases" external>
            money
          </A>{" "}
          to make purchases, or the{" "}
          <A href="/settings/licenses" external>
            licenses
          </A>{" "}
          to{" "}
          <A href="https://doc.cocalc.com/add-lic-project.html">
            upgrade projects.
          </A>{" "}
          If a license doesn't fit,{" "}
          <A href="/settings/licenses" external>
            easily edit it,
          </A>{" "}
          including receiving a prorated refund to buy something else, or paying
          more for a more powerful license.
        </p>
        If you have any questions, <A href="/support">contact support</A> visit{" "}
        <A href="/vouchers">the Voucher Center</A>, or{" "}
        <A href="https://doc.cocalc.com/vouchers.html">read the docs</A>.
      </div>
    </>
  );
}
