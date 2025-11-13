import { Alert } from "antd";
import { A } from "@cocalc/frontend/components/A";

export default function InsecureTestModeBanner() {
  return (
    <Alert
      banner
      type="warning"
      showIcon
      style={{ background: "darkred", color: "white" }}
      message={
        <div style={{ textAlign: "center" }}>
          <A
            href="https://cocalc.com/pricing/onprem"
            style={{ color: "white" }}
          >
            <b>WARNING:</b> This is CoCalc OnPrem running in{" "}
            <b>A HIGHLY INSECURE TRIAL MODE</b>.
          </A>
        </div>
      }
    />
  );
}
