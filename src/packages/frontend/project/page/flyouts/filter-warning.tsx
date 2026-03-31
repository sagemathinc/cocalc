/*
 *  This file is part of CoCalc: Copyright © 2023-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Tooltip } from "antd";
import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";

import { Icon, Text } from "@cocalc/frontend/components";
import { pasteHere as doPaste } from "@cocalc/frontend/file-clipboard/actions";
import { formatClipboardTip } from "@cocalc/frontend/file-clipboard/clipboard-pill";
import { useFileClipboard } from "@cocalc/frontend/file-clipboard/hook";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { FLYOUT_PADDING } from "./consts";

export function FlyoutFilterWarning({
  filter,
  setFilter,
}: {
  filter: string;
  setFilter: (string) => void;
}) {
  if (!filter) return null;

  return (
    <Alert
      type="info"
      banner
      showIcon={false}
      style={{ padding: FLYOUT_PADDING, margin: 0 }}
      description={
        <>
          <FlyoutClearFilter setFilter={setFilter} />
          Only showing files matching "<Text code>{filter}</Text>".
        </>
      }
    />
  );
}

export function FlyoutClearFilter({
  setFilter,
}: {
  setFilter: (string) => void;
}) {
  return (
    <Tooltip title="Clear search" placement="bottom">
      <Button
        size="small"
        type="text"
        style={{ float: "right", color: COLORS.GRAY_M }}
        onClick={() => setFilter("")}
        icon={<Icon name="close-circle-filled" />}
      />
    </Tooltip>
  );
}

/** Banner shown above the flyout file list when clipboard has files.
 *  Same visual style as FlyoutFilterWarning. */
export const FlyoutClipboardBanner: React.FC<{
  project_id: string;
  current_path: string;
}> = React.memo(({ project_id, current_path }) => {
  const intl = useIntl();
  const { mode, files, clear } = useFileClipboard();
  const [pasting, setPasting] = useState(false);

  const handlePaste = useCallback(
    async (e?: React.MouseEvent) => {
      setPasting(true);
      try {
        await doPaste(project_id, current_path, e?.shiftKey);
      } catch (_err) {
        // Errors are shown via the activity system
      } finally {
        setPasting(false);
      }
    },
    [project_id, current_path],
  );

  if (!mode || !files.length) return null;

  const label =
    mode === "copy"
      ? intl.formatMessage(labels.clipboard_paste_to_copy, {
          count: files.length,
        })
      : intl.formatMessage(labels.clipboard_paste_to_cut, {
          count: files.length,
        });

  return (
    <Alert
      type="warning"
      banner
      showIcon={false}
      style={{
        padding: FLYOUT_PADDING,
        margin: 0,
        cursor: "pointer",
        background: COLORS.ANTD_ORANGE,
      }}
      onClick={handlePaste}
      description={
        <>
          <Tooltip title={intl.formatMessage(labels.clipboard_clear)}>
            <Button
              size="small"
              type="text"
              style={{ float: "right", color: COLORS.GRAY_M }}
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              icon={<Icon name="close-circle-filled" />}
            />
          </Tooltip>
          <Tooltip
            title={formatClipboardTip(intl)}
            placement="bottom"
          >
            <span>
              {pasting ? (
                <Icon name="spinner" spin />
              ) : (
                <Icon name="paste" />
              )}{" "}
              {label}
            </span>
          </Tooltip>
        </>
      }
    />
  );
});
