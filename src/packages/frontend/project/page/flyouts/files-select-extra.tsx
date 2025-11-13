/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip, Space } from "antd";
import immutable from "immutable";

import { Button as BSButton } from "@cocalc/frontend/antd-bootstrap";
import { Icon } from "@cocalc/frontend/components";

interface FilesSelectButtonsProps {
  checked_files: immutable.Set<string>;
  mode: "open" | "select";
  selectAllFiles(): void;
  clearAllSelections(skip: boolean): void;
  setMode: (mode: "open" | "select") => void;
}

export function FilesSelectButtons({
  checked_files,
  setMode,
  mode,
  selectAllFiles,
  clearAllSelections,
}: FilesSelectButtonsProps) {
  function renderButtons() {
    if (mode !== "select") return null;

    if (checked_files.size === 0) {
      return (
        <Tooltip title="Select all files">
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              selectAllFiles();
            }}
          >
            All
          </Button>
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title="Deselect all selected files">
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              clearAllSelections(false);
            }}
          >
            Clear
          </Button>
        </Tooltip>
      );
    }
  }

  return (
    <Space.Compact size="small">
      <BSButton
        bsSize="xsmall"
        active={mode === "select"}
        title={
          <>
            Switch into file file selection mode.
            <br />
            Note: Like on a desktop, you can also use the Shift and Ctrl key for
            selecting files – or hover over the file icon to reveal the
            checkbox.
          </>
        }
        onClick={(e) => {
          e.stopPropagation();
          const nextMode = mode === "select" ? "open" : "select";
          if (nextMode === "open") {
            clearAllSelections(true);
          }
          setMode(nextMode);
        }}
      >
        <Icon name={mode === "select" ? "check-square" : "square"} /> Select
      </BSButton>
      {renderButtons()}
    </Space.Compact>
  );
}
