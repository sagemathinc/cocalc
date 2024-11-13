/*
Show tag for each service

- [ ] TODO: add links/popups so clicking on service provides helpful additional context, configuration, etc.
*/

import { Tag, Tooltip } from "antd";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { AutoBalanceModal } from "./auto-balance";
import { useState } from "react";
import Next from "@cocalc/frontend/components/next";

export default function ServiceTag({
  service,
  style,
}: {
  service: Service;
  style?;
}) {
  const [showAutoCreditModal, setShowAutoCreditModal] =
    useState<boolean>(false);

  const spec = QUOTA_SPEC[service];
  let tag = (
    <Tag
      style={{
        whiteSpace: "pre-wrap",
        cursor: "pointer",
        ...style,
      }}
      color={spec?.color}
      onClick={() => {
        if (showAutoCreditModal) {
          return;
        }
        if (service == "auto-credit") {
          setShowAutoCreditModal(!showAutoCreditModal);
        }
      }}
    >
      {spec?.display ?? service}
      {showAutoCreditModal && (
        <AutoBalanceModal
          onClose={() => {
            setShowAutoCreditModal(false);
          }}
        />
      )}
    </Tag>
  );
  if (service == "voucher") {
    tag = <Next href={"vouchers"}>{tag}</Next>;
  }
  if (spec.description) {
    return <Tooltip title={spec.description}>{tag}</Tooltip>;
  } else {
    return tag;
  }
}
