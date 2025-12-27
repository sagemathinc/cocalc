/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Badge, Button, Drawer, Layout } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { ChatRoomSidebar } from "./chatroom-sidebar";

const CHAT_LAYOUT_STYLE: React.CSSProperties = {
  height: "100%",
  background: "white",
} as const;

interface ChatRoomLayoutProps {
  variant: "default" | "compact";
  sidebarWidth: number;
  setSidebarWidth: (value: number) => void;
  sidebarVisible: boolean;
  setSidebarVisible: (value: boolean) => void;
  totalUnread: number;
  sidebarContent: React.ReactNode;
  chatContent: React.ReactNode;
  onNewChat: () => void;
  newChatSelected: boolean;
}

export function ChatRoomLayout({
  variant,
  sidebarWidth,
  setSidebarWidth,
  sidebarVisible,
  setSidebarVisible,
  totalUnread,
  sidebarContent,
  chatContent,
  onNewChat,
  newChatSelected,
}: ChatRoomLayoutProps) {
  if (variant === "compact") {
    return (
      <div className="smc-vfill" style={{ background: "white" }}>
        <Drawer
          open={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
          placement="right"
          title="Chats"
          destroyOnClose
          resizable
        >
          {sidebarContent}
        </Drawer>
        <div
          style={{
            padding: "10px",
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <Button
            icon={<Icon name="bars" />}
            onClick={() => setSidebarVisible(true)}
          >
            Chats
            <Badge
              count={totalUnread}
              overflowCount={99}
              style={{
                backgroundColor: COLORS.GRAY_L0,
                color: COLORS.GRAY_D,
              }}
            />
          </Button>
          <Button type={newChatSelected ? "primary" : "default"} onClick={onNewChat}>
            New Chat
          </Button>
        </div>
        {chatContent}
      </div>
    );
  }

  return (
    <Layout
      hasSider
      style={{
        ...CHAT_LAYOUT_STYLE,
        position: "relative",
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "row",
      }}
    >
      <ChatRoomSidebar width={sidebarWidth} setWidth={setSidebarWidth}>
        {sidebarContent}
      </ChatRoomSidebar>
      <Layout.Content
        className="smc-vfill"
        style={{
          background: "white",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          height: "100%",
        }}
      >
        {chatContent}
      </Layout.Content>
    </Layout>
  );
}
