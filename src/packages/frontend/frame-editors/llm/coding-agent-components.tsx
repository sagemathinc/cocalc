/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Small reusable UI components for the coding agent panel.
Extracted to keep the main CodingAgentCore component focused.
*/

import { Input, Modal } from "antd";
import { useEffect, useRef, useState } from "react";

import { DIFF_MAX_HEIGHT } from "./coding-agent-types";

/**
 * Wraps rendered markdown so that `pre` blocks (diffs, code) are
 * compact by default and scrollable within a max-height.
 */
export function CollapsibleDiffs({
  children,
}: {
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Apply compact styling to <pre> elements after content changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const pres = el.querySelectorAll("pre");
    pres.forEach((pre) => {
      pre.style.fontSize = "0.82em";
      pre.style.maxHeight = `${DIFF_MAX_HEIGHT}px`;
      pre.style.overflow = "auto";
      pre.style.position = "relative";
    });
  }, [children]);

  return <div ref={containerRef}>{children}</div>;
}

/**
 * Small isolated component for the rename modal so typing doesn't
 * re-render the entire CodingAgentCore tree.
 */
export function RenameModal({
  open,
  currentName,
  onSave,
  onCancel,
}: {
  open: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<any>(null);

  // Reset value and focus when the modal opens.
  useEffect(() => {
    if (open) {
      setValue(currentName);
      // Focus + select after antd animation completes
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, currentName]);

  const handleOk = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  return (
    <Modal
      title="Rename Turn"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Save"
      destroyOnClose
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={handleOk}
        placeholder="Enter a name for this turn..."
        maxLength={80}
      />
    </Modal>
  );
}
