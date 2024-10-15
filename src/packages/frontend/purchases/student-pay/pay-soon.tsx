import { Button, Collapse, Divider, Space } from "antd";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { useState } from "react";
import Cost from "./cost";
import PayLink from "./pay-link";
import Transfer from "./transfer";

interface Props {
  when: dayjs.Dayjs;
  purchaseInfo: PurchaseInfo;
  setOpen: (open: boolean) => void;
  project_id: string;
}

export default function PaySoon({
  when,
  purchaseInfo,
  setOpen,
  project_id,
}: Props) {
  const [hide, setHide] = useState<boolean>(false);
  if (hide) {
    return null;
  }
  return (
    <div>
      <Collapse>
        <Collapse.Panel
          key="it"
          header=<>
            Course Fee:{" "}
            <b>
              <a
                onClick={() => {
                  setOpen(true);
                }}
              >
                Please pay the course fee
              </a>
            </b>{" "}
            <Cost purchaseInfo={purchaseInfo} /> to upgrade this project.{" "}
            <b>
              Due: <TimeAgo date={when} />.
            </b>
            <Button
              size="small"
              style={{ float: "right", fontSize: "9pt" }}
              onClick={() => setHide(true)}
            >
              <Icon name="times" /> Dismiss
            </Button>{" "}
          </>
        >
          <div style={{ textAlign: "center" }}>
            <Button
              size="large"
              type="primary"
              onClick={() => {
                setOpen(true);
              }}
            >
              <Icon name="credit-card" /> Pay Course Fee...
            </Button>
          </div>
          <Divider>Other Options</Divider>
          <Space align="start">
            <PayLink project_id={project_id} />
            <Transfer project_id={project_id} />
          </Space>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
