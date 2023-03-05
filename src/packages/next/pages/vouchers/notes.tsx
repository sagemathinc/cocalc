import { useState } from "react";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import apiPost from "lib/api/post";
import { Alert, Button, Input, Space, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Notes({ notes: notes0, code }) {
  const [editing, setEditing] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>(notes0);
  const [editVal, setEditVal] = useState<string>(notes);
  const [error, setError] = useState<string>("");

  if (editing) {
    return (
      <div style={{ width: "450px" }}>
        <Input.TextArea
          value={editVal}
          autoSize
          onChange={(e) => setEditVal(e.target.value)}
        />
        <Space>
          <Button.Group style={{ marginTop: "5px" }}>
            <Button
              type="primary"
              onClick={async () => {
                try {
                  await apiPost("/vouchers/set-voucher-code-notes", {
                    code,
                    notes: editVal,
                  });
                  setNotes(editVal);
                  setEditing(false);
                } catch (err) {
                  setError(`${err}`);
                }
              }}
            >
              Save
            </Button>
            <Button
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </Button.Group>
          <span style={{ color: "#666" }}>
            Add notes about this voucher code that only you can see (supports
            markdown).
          </span>
        </Space>
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            closable
            onClose={() => setError("")}
          />
        )}
      </div>
    );
  }

  if (notes) {
    return (
      <Tooltip title={"Click to edit"}>
        <div onClick={() => setEditing(true)} style={{ cursor: "pointer" }}>
          <Markdown value={notes} />
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={"Click to add a private note about this voucher code"}>
      {" "}
      <Button type="text" onClick={() => setEditing(true)}>
        <Icon name="plus" />
      </Button>
    </Tooltip>
  );
}
