/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Page Navigation Controls Component for LaTeX Editor Output Panel
Provides page number input and previous/next page navigation
*/

import { Button, InputNumber, Space } from "antd";
import { useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

import { Actions } from "./actions";

// Tweak it in such a way, that it looks consistent with ./*-sync.tsx left/right arrows
export const CONTROL_BUTTON_PADDING = "0 14px";

const CONTROL_PAGE_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  fontSize: "13px",
  color: COLORS.GRAY_M,
} as const;

interface PageNavigationControlsProps {
  actions: Actions;
  id: string;
  totalPages: number;
  currentPage: number;
  narrow?: boolean;
}

export function PageNavigationControls({
  actions,
  id,
  totalPages,
  currentPage,
  narrow,
}: PageNavigationControlsProps) {
  const intl = useIntl();

  const flipPage = (direction: 1 | -1) => {
    const newPage =
      direction === 1
        ? Math.min(totalPages, currentPage + 1)
        : Math.max(1, currentPage - 1);

    if (newPage !== currentPage) {
      // Save to local view state for persistence
      const local_view_state = actions.store.get("local_view_state");
      actions.setState({
        local_view_state: local_view_state.setIn([id, "currentPage"], newPage),
      });
      // Also call setPage on parent frame
      actions.setPage(id, newPage);
    }
  };

  const handlePageChange = (page: number | null) => {
    if (!page) return;

    let validPage = page;
    if (page <= 1) {
      validPage = 1;
    }
    if (page >= totalPages) {
      validPage = totalPages;
    }

    // Save to local view state for persistence
    const local_view_state = actions.store.get("local_view_state");
    actions.setState({
      local_view_state: local_view_state.setIn([id, "currentPage"], validPage),
    });

    // Also call setPage on parent frame for any other components that need it
    actions.setPage(id, validPage);
  };

  if (totalPages === 0) {
    return null;
  }

  return (
    <div style={CONTROL_PAGE_STYLE} role="region" aria-label="Page navigation">
      <InputNumber
        size="small"
        style={{
          width: "7ex",
          fontSize: "13px",
        }}
        step={-1}
        value={currentPage}
        onChange={handlePageChange}
      />
      {!narrow && <> / {totalPages}</>}
      <Space.Compact>
        <Tip title={intl.formatMessage(labels.previous_page)} placement="top">
          <Button
            size="small"
            icon={<Icon name="arrow-up" />}
            onClick={() => flipPage(-1)}
            disabled={currentPage <= 1}
            style={{ padding: CONTROL_BUTTON_PADDING }}
          />
        </Tip>

        <Tip title={intl.formatMessage(labels.next_page)} placement="top">
          <Button
            size="small"
            icon={<Icon name="arrow-down" />}
            onClick={() => flipPage(1)}
            disabled={currentPage >= totalPages}
            style={{ padding: CONTROL_BUTTON_PADDING }}
          />
        </Tip>
      </Space.Compact>
    </div>
  );
}
