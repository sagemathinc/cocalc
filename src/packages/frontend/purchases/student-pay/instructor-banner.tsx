import { Button, Collapse } from "antd";
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
    <Collapse>
      <Collapse.Panel
        key="it"
        header=<>
          Course Fee: Student is required to pay the one-time course fee to
          upgrade this project.
          <Button size="small" style={{ float: "right" }}>
            Dismiss
          </Button>{" "}
        </>
      >
        <TimeAgo date={when} />
        <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
        <Button type="primary">Course...</Button>
      </Collapse.Panel>
    </Collapse>
  );
}
