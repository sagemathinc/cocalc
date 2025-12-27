/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider, Input, Select, Space, Tooltip } from "antd";
import { debounce } from "lodash";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { hoursToTimeIntervalHuman } from "@cocalc/util/misc";
import type { ChatActions } from "./actions";
import Filter from "./filter";

const FILTER_RECENT_NONE = {
  value: 0,
  label: (
    <>
      <Icon name="clock" />
    </>
  ),
} as const;

interface ChatRoomHeaderProps {
  actions: ChatActions;
  messagesSize: number;
  search: string;
  showThreadFilters: boolean;
  disableFilters: boolean;
  filterRecentH: number;
  filterRecentHCustom: string;
  setFilterRecentHCustom: (value: string) => void;
  filterRecentOpen: boolean;
  setFilterRecentOpen: (value: boolean) => void;
}

export function ChatRoomHeader({
  actions,
  messagesSize,
  search,
  showThreadFilters,
  disableFilters,
  filterRecentH,
  filterRecentHCustom,
  setFilterRecentHCustom,
  filterRecentOpen,
  setFilterRecentOpen,
}: ChatRoomHeaderProps) {
  if (!showThreadFilters || disableFilters) {
    return null;
  }
  if (messagesSize <= 5) {
    return null;
  }

  const isValidFilterRecentCustom = () => {
    const v = parseFloat(filterRecentHCustom);
    return isFinite(v) && v >= 0;
  };

  const renderFilterRecent = () => (
    <Tooltip title="Only show recent threads.">
      <Select
        open={filterRecentOpen}
        onDropdownVisibleChange={(v) => setFilterRecentOpen(v)}
        value={filterRecentH}
        status={filterRecentH > 0 ? "warning" : undefined}
        allowClear
        onClear={() => {
          actions.setFilterRecentH(0);
          setFilterRecentHCustom("");
        }}
        popupMatchSelectWidth={false}
        onSelect={(val: number) => actions.setFilterRecentH(val)}
        options={[
          FILTER_RECENT_NONE,
          ...[1, 6, 12, 24, 48, 24 * 7, 14 * 24, 28 * 24].map((value) => {
            const label = hoursToTimeIntervalHuman(value);
            return { value, label };
          }),
        ]}
        labelRender={({ label, value }) => {
          if (!label) {
            if (isValidFilterRecentCustom()) {
              value = parseFloat(filterRecentHCustom);
              label = hoursToTimeIntervalHuman(value);
            } else {
              ({ label, value } = FILTER_RECENT_NONE);
            }
          }
          return (
            <Tooltip
              title={
                value === 0
                  ? undefined
                  : `Only threads with messages sent in the past ${label}.`
              }
            >
              {label}
            </Tooltip>
          );
        }}
        dropdownRender={(menu) => (
          <>
            {menu}
            <Divider style={{ margin: "8px 0" }} />
            <Input
              placeholder="Number of hours"
              allowClear
              value={filterRecentHCustom}
              status={
                filterRecentHCustom == "" || isValidFilterRecentCustom()
                  ? undefined
                  : "error"
              }
              onChange={debounce(
                (e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setFilterRecentHCustom(v);
                  const val = parseFloat(v);
                  if (isFinite(val) && val >= 0) {
                    actions.setFilterRecentH(val);
                  } else if (v == "") {
                    actions.setFilterRecentH(FILTER_RECENT_NONE.value);
                  }
                },
                150,
                { leading: true, trailing: true },
              )}
              onKeyDown={(e) => e.stopPropagation()}
              onPressEnter={() => setFilterRecentOpen(false)}
              addonAfter={<span style={{ paddingLeft: "5px" }}>hours</span>}
            />
          </>
        )}
      />
    </Tooltip>
  );

  return (
    <Space style={{ marginTop: "5px", marginLeft: "15px" }} wrap>
      <Filter
        actions={actions}
        search={search}
        style={{
          margin: 0,
          width: "100%",
        }}
      />
      {renderFilterRecent()}
    </Space>
  );
}
