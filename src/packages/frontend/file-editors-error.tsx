/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert as AntdAlert, Button } from "antd";
import { ReactElement } from "react";

import { Icon, Paragraph } from "@cocalc/frontend/components";

interface EditorLoadErrorProps {
  path: string;
  error: Error;
}

/**
 * Error component shown when editor fails to load.
 * Displays error message with a button to refresh the page.
 */
export function EditorLoadError(props: EditorLoadErrorProps): ReactElement {
  const { path, error } = props;

  const handleRefresh = () => {
    // Refresh the page while preserving the current URL
    window.location.reload();
  };

  return (
    <AntdAlert
      type="error"
      message="Editor Load Failed"
      description={
        <div style={{ marginTop: "12px" }}>
          <Paragraph>File: {path}</Paragraph>
          <Paragraph code>{String(error)}</Paragraph>
          <Paragraph>
            This usually happens due to temporary network issues.
          </Paragraph>
          <Button type="primary" size="large" onClick={handleRefresh}>
            <Icon name="reload" /> Refresh Page
          </Button>
        </div>
      }
      showIcon
      style={{ margin: "20px" }}
    />
  );
}
