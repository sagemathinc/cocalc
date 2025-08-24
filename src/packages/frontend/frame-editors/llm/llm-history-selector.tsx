/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties, useState } from "react";
import { Button, Dropdown, Input, Menu, MenuProps, Tooltip } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";

interface LLMHistorySelectorProps {
  prompts: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
  width?: number;
  alignSelf?: "stretch" | "flex-start" | "flex-end" | "center" | "baseline";
}

export function LLMHistorySelector({
  prompts,
  onSelect,
  disabled = false,
  style,
  width = 350,
  alignSelf = "stretch",
}: LLMHistorySelectorProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Don't render if no prompts
  if (prompts.length === 0) {
    return null;
  }

  const defaultStyle: CSSProperties = {
    height: "auto",
    alignSelf,
    ...style,
  };

  // Filter prompts based on search text
  const filteredPrompts = prompts.filter((prompt) =>
    prompt.toLowerCase().includes(searchText.toLowerCase()),
  );

  const menuItems: MenuProps["items"] = filteredPrompts.map((prompt, idx) => ({
    key: idx.toString(),
    label: (
      <Tooltip title={prompt} placement="left">
        <div
          style={{
            maxWidth: `${width - 50}px`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {prompt}
        </div>
      </Tooltip>
    ),
    onClick: () => {
      onSelect(prompt);
      setIsOpen(false);
      setSearchText("");
    },
  }));

  const overlay = (
    <div
      style={{
        backgroundColor: "white",
        border: `1px solid ${COLORS.GRAY_DDD}`,
        borderRadius: "6px",
        boxShadow: "0 6px 16px 0 rgba(0, 0, 0, 0.08)",
        width,
        overflowX: "hidden",
      }}
    >
      <div style={{ padding: 8, borderBottom: `1px solid ${COLORS.GRAY_LL}` }}>
        <Input
          placeholder="Search history..."
          allowClear
          autoFocus
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: "100%" }}
        />
      </div>
      <div
        style={{
          maxHeight: width - 50,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {filteredPrompts.length > 0 ? (
          <Menu
            items={menuItems}
            style={{
              border: "none",
              boxShadow: "none",
              maxHeight: "none",
              overflow: "visible",
              width: "100%",
            }}
          />
        ) : (
          <div
            style={{ padding: 16, textAlign: "center", color: COLORS.FILE_EXT }}
          >
            No matching prompts
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dropdown
      popupRender={() => overlay}
      trigger={["click"]}
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchText("");
        }
      }}
      disabled={disabled}
      placement="bottomRight"
    >
      <Button
        style={defaultStyle}
        icon={<Icon name="history" />}
        disabled={disabled}
      />
    </Dropdown>
  );
}
