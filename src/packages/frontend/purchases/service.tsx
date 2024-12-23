/*
Show tag for each service

- [ ] TODO: add links/popups so clicking on service provides helpful additional context, configuration, etc.
*/

import { Tag, Tooltip } from "antd";
import { useState } from "react";

import Next from "@cocalc/frontend/components/next";
import {
  QUOTA_SPEC,
  Service,
  Spec,
} from "@cocalc/util/db-schema/purchase-quotas";
import { AutoBalanceModal } from "./auto-balance";

export default function ServiceTag({
  service,
  style,
}: {
  service: Service;
  style?;
}) {
  const [showAutoCreditModal, setShowAutoCreditModal] =
    useState<boolean>(false);

  // safeguard for https://github.com/sagemathinc/cocalc/issues/8074
  const spec = QUOTA_SPEC[service] satisfies Spec as Spec | null;

  if (spec == null) {
    console.warn(
      `ServiceTag: service=${service} has no known Spec for the quota.`,
    );
  }

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

  if (spec?.description) {
    return <Tooltip title={spec.description}>{tag}</Tooltip>;
  } else {
    return tag;
  }
}
