/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Clipboard pill for the explorer info row.
// Styled identically to the filter badges ("Contains ...", "Masked files", etc.)
// Clicking the label pastes; clicking ✕ clears the clipboard.

import { Button } from "antd";
import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { ACTIVE_FILTER_BTN_STYLE } from "@cocalc/frontend/project/explorer/action-bar";

import { pasteHere as doPaste } from "./actions";
import { useFileClipboard } from "./hook";

const BR = <br />;

/** Format the shared clipboard tooltip using i18n.
 *  Pass the `intl` object from the calling component. */
export function formatClipboardTip(intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage(labels.clipboard_tip, {
    br: BR,
    b: (ch) => <b>{ch}</b>,
  });
}

interface ClipboardPillProps {
  project_id: string;
  current_path: string;
}

export const ClipboardPill: React.FC<ClipboardPillProps> = React.memo(
  ({ project_id, current_path }) => {
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

    const pasteLabel =
      mode === "copy"
        ? intl.formatMessage(labels.clipboard_paste_to_copy, {
            count: files.length,
          })
        : intl.formatMessage(labels.clipboard_paste_to_cut, {
            count: files.length,
          });

    return (
      <Tip
        title="File Clipboard"
        tip={<>{formatClipboardTip(intl)}</>}
        placement="bottom"
      >
        <Button
          type="text"
          size="small"
          style={ACTIVE_FILTER_BTN_STYLE}
          onClick={handlePaste}
          loading={pasting}
        >
          <Icon name="paste" /> {pasteLabel}{" "}
          <Icon
            name="times-circle"
            onClick={(e?: React.MouseEvent) => {
              e?.stopPropagation();
              clear();
            }}
          />
        </Button>
      </Tip>
    );
  },
);
