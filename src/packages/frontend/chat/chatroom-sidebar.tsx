/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { Resizable } from "re-resizable";

const THREAD_SIDEBAR_STYLE: React.CSSProperties = {
  background: "#fafafa",
  borderRight: "1px solid #eee",
  padding: "15px 0",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  height: "100%",
  minHeight: 0,
  transition: "none",
} as const;

interface ChatRoomSidebarProps {
  width: number;
  setWidth: (value: number) => void;
  children: React.ReactNode;
}

export function ChatRoomSidebar({
  width,
  setWidth,
  children,
}: ChatRoomSidebarProps) {
  const minWidth = 125;
  const maxWidth = 600;
  const handleStyles = {
    right: {
      width: "6px",
      right: "-3px",
      cursor: "col-resize",
      background: "transparent",
    },
  } as const;
  const handleComponent = {
    right: (
      <div
        aria-label="Resize sidebar"
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.0))",
        }}
      />
    ),
  } as const;
  const sider = (
    <Layout.Sider
      width={width}
      style={THREAD_SIDEBAR_STYLE}
      collapsible={false}
      trigger={null}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "auto",
          transition: "none",
        }}
      >
        {children}
      </div>
    </Layout.Sider>
  );
  if (IS_MOBILE) {
    return sider;
  }
  return (
    <Resizable
      size={{ width, height: "100%" }}
      enable={{ right: true }}
      minWidth={minWidth}
      maxWidth={maxWidth}
      handleStyles={handleStyles}
      handleComponent={handleComponent}
      onResizeStop={(_, __, ___, delta) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, width + delta.width),
        );
        setWidth(next);
      }}
    >
      {sider}
    </Resizable>
  );
}
