/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Tooltip } from "antd";

import { Icon, Text } from "@cocalc/frontend/components";
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
