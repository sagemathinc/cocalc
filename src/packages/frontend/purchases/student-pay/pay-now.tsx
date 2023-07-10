import { Modal } from "antd";
import { useState } from "react";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import { TimeAgo } from "@cocalc/frontend/components";
import { zIndex as zIndexPayAsGo } from "../pay-as-you-go/modal";

interface Props {
  when: dayjs.Dayjs;
  purchaseInfo: PurchaseInfo;
  project_id: string;
}

export default function PayNow({ when, purchaseInfo, project_id }: Props) {
  const [open, setOpen] = useState<boolean>(true);

  return (
    <Modal
      closable={false}
      open={open}
      zIndex={zIndexPayAsGo - 1}
      destroyOnClose
      footer={null}
    >
      Please pay the one-time course fee to upgrade this project.{" "}
      <TimeAgo date={when} />
      <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
    </Modal>
  );
}
