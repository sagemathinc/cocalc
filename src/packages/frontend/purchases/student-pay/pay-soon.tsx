import { Alert, Button } from "antd";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import { TimeAgo } from "@cocalc/frontend/components";

interface Props {
  when: dayjs.Dayjs;
  purchaseInfo: PurchaseInfo;
  project_id: string;
}

export default function PaySoon({ when, purchaseInfo, project_id }: Props) {
  return (
    <Alert
      message="Course Fee"
      description={
        <div>
          Please pay the one-time course fee to upgrade this project.{" "}
          <TimeAgo date={when} />
          <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
          <Button>Dismiss</Button> <Button type="primary">Pay Now</Button>
        </div>
      }
    />
  );
}
