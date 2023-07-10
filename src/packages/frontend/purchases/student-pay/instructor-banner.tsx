import { Button, Collapse } from "antd";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { useState } from "react";
import Cost from "./cost";

interface Props {
  when: dayjs.Dayjs;
  purchaseInfo: PurchaseInfo;
}

export default function PaySoon({ when, purchaseInfo }: Props) {
  const [hide, setHide] = useState<boolean>(false);
  if (hide) {
    return null;
  }
  return (
    <div style={{ margin: "0 2.5px" }}>
      <Collapse>
        <Collapse.Panel
          key="it"
          header=<>
            Course Fee: Student is required to pay the course fee{" "}
            <Cost purchaseInfo={purchaseInfo} /> to upgrade this project. Due:{" "}
            <TimeAgo date={when} />.
            <Button
              size="small"
              style={{ float: "right", fontSize: "9pt" }}
              onClick={() => setHide(true)}
            >
              <Icon name="times" /> Dismiss
            </Button>{" "}
          </>
        >
          <Button type="primary">Course...</Button>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
//           <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
