import { Card } from "antd";
import type { QuotaData } from "./misc";

export default function PayAsYouGoProjectUpgrade({ record }) {
  return (
    <Card>
      <pre style={{ maxHeight: "100px", maxWidth: "300px", overflow: "auto" }}>
        {JSON.stringify(record, undefined, 2)}
      </pre>
    </Card>
  );
}
