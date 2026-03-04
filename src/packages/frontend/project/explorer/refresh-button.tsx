/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Small "Refresh" button shown when a deferred listing update is pending.
 * Renders either as a text button (with label) or icon-only (with tooltip),
 * controlled by the `iconOnly` prop.
 */

import { Button, Tooltip } from "antd";
import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  onClick?: () => void;
  /** When true, render icon-only with a tooltip. */
  iconOnly?: boolean;
}

export function RefreshButton({ onClick, iconOnly }: Props) {
  const intl = useIntl();
  const label = intl.formatMessage(labels.refresh);

  const btn = (
    <Button
      type="text"
      size="small"
      style={{
        color: COLORS.ANTD_LINK_BLUE,
        padding: iconOnly ? 0 : undefined,
      }}
      icon={<Icon name="sync-alt" />}
      onClick={onClick}
    >
      {iconOnly ? undefined : label}
    </Button>
  );

  return iconOnly ? <Tooltip title={label}>{btn}</Tooltip> : btn;
}
