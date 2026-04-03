/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Small "Refresh" button shown when a deferred listing update is pending.
 * Styled like the orange "active filter" badge so it stands out.
 */

import { Button } from "antd";
import { useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  onClick?: () => void;
}

export function RefreshButton({ onClick }: Props) {
  const intl = useIntl();

  return (
    <Tip
      title={intl.formatMessage(labels.refresh)}
      tip="Click to apply pending filesystem changes. Enable automatic updates in Preferences → Other → File Explorer."
    >
      <Button
        type="text"
        size="small"
        style={{
          background: COLORS.YELL_LLL,
          color: "var(--cocalc-text-primary, black)",
          borderRadius: 4,
          whiteSpace: "nowrap",
          marginLeft: 6,
        }}
        icon={<Icon name="sync-alt" />}
        onClick={onClick}
      >
        {intl.formatMessage(labels.refresh)}
      </Button>
    </Tip>
  );
}
