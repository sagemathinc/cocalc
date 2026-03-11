/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Small isolated component for the rename modal so typing doesn't
re-render the entire agent tree.  Shared by all agent variants.
*/

import { Input, Modal } from "antd";
import { useEffect, useRef, useState } from "react";

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

  // Reset value when the modal opens.
  useEffect(() => {
    if (open) {
      setValue(currentName);
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
      afterOpenChange={(visible) => {
        if (visible) {
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      }}
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
