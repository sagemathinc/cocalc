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
        When you <A href="/redeem">redeem</A> a{" "}
        <A href="/store/vouchers">voucher</A>, one or more{" "}
        <A href="https://doc.cocalc.com/licenses.html">licenses</A> will be
        added to your account. You can use{" "}
        <A href="/licenses/managed">licenses</A> to{" "}
        <A href="https://doc.cocalc.com/add-lic-project.html">
          upgrade your projects
        </A>
        . If you have any questions, <A href="/support">contact support</A>{" "}
        visit <A href="/vouchers">the Voucher Center</A>, or{" "}
        <A href="https://doc.cocalc.com/vouchers.html">read the docs</A>.
      </div>
    </>
  );
}
