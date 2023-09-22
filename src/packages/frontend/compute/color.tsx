import { Button, Space, Spin } from "antd";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useState } from "react";
import { setServerColor } from "./api";

export default function Color({ color, id, editable, setError }) {
  const [saving, setSaving] = useState<boolean>(false);
  const [edit, setEdit] = useState<boolean>(false);
  const [choice, setChoice] = useState<string>(color);
  return (
    <div>
      <Space style={{ width: "100%" }}>
        <div
          style={{
            width: "100px",
            height: "18px",
            background: choice ?? "#aaa",
          }}
        />{" "}
        {editable && (
          <>
            <Button
              size="small"
              type={edit ? "primary" : undefined}
              disabled={saving || (edit && color == choice)}
              style={{ float: "right" }}
              onClick={async () => {
                if (edit) {
                  if (choice == color) return;
                  // save to backend
                  try {
                    setSaving(true);
                    await setServerColor({ color: choice, id });
                  } catch (err) {
                    setError(`${err}`);
                  } finally {
                    setSaving(false);
                  }
                }
                setEdit(!edit);
              }}
            >
              {edit ? "Save" : "Edit..."}
              {saving && <Spin />}
            </Button>
            {edit && (
              <Button
                size="small"
                onClick={() => {
                  setChoice(color);
                  setEdit(false);
                }}
              >
                Cancel
              </Button>
            )}
          </>
        )}
      </Space>
      {edit && (
        <div style={{ marginTop: "15px" }}>
          <ColorPicker color={color} onChange={setChoice} />
        </div>
      )}
    </div>
  );
}
