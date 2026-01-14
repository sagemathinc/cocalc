import { Alert, Button } from "antd";
import type { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { useState } from "react";
import Cost from "./cost";

interface Props {
  when: dayjs.Dayjs;
  purchaseInfo: PurchaseInfo;
  setOpen: (open: boolean) => void;
}

export default function PaySoon({ when, purchaseInfo, setOpen }: Props) {
  const [hide, setHide] = useState<boolean>(false);
  if (hide) {
    return null;
  }
  return (
    <Alert
      type="success"
      banner
      message={
        <div style={{ fontSize: "12pt" }}>
          <span
            onClick={() => {
              setOpen(true);
            }}
            style={{ cursor: "pointer" }}
          >
            Course Fee:{" "}
            <b>
              <a
                onClick={() => {
                  setOpen(true);
                }}
              >
                Pay the required course fee of
              </a>
            </b>{" "}
            <Cost purchaseInfo={purchaseInfo} /> to upgrade this project.{" "}
            <b>
              Due: <TimeAgo date={when} />.
            </b>
          </span>
          <Button
            size="small"
            style={{ float: "right", fontSize: "9pt" }}
            onClick={() => setHide(true)}
          >
            <Icon name="times" /> Dismiss
          </Button>{" "}
        </div>
      }
    />
  );
}
