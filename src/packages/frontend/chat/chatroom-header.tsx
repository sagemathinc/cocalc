/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";
import type { ChatActions } from "./actions";
import Filter from "./filter";

interface ChatRoomHeaderProps {
  actions: ChatActions;
  messagesSize: number;
  search: string;
  showThreadFilters: boolean;
  disableFilters: boolean;
}

export function ChatRoomHeader({
  actions,
  messagesSize,
  search,
  showThreadFilters,
  disableFilters,
}: ChatRoomHeaderProps) {
  if (!showThreadFilters || disableFilters) {
    return null;
  }
  if (messagesSize <= 5) {
    return null;
  }

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
    </Space>
  );
}
