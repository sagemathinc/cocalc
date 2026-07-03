/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Space } from "antd";
import type { ReactNode } from "react";

import Markdown from "@cocalc/frontend/editors/slate/static-markdown";

interface AuthNoticeProps {
  message?: string;
  url?: string;
  linkText?: string;
  defaultMessage: string;
  extra?: ReactNode;
}

export default function AuthNotice({
  message,
  url,
  linkText,
  defaultMessage,
  extra,
}: AuthNoticeProps) {
  const body = message?.trim() || defaultMessage;
  const href = url?.trim();
  return (
    <Alert
      type="info"
      showIcon
      style={{ margin: "15px 0 25px" }}
      message={<Markdown value={body} />}
      description={
        (href || extra) && (
          <Space wrap>
            {href && (
              <Button type="primary" href={href}>
                {linkText?.trim() || "Continue"}
              </Button>
            )}
            {extra}
          </Space>
        )
      }
    />
  );
}
