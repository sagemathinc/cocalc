import { Button, Space, Spin, Tooltip } from "antd";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useEffect, useState } from "react";
import { setServerColor } from "./api";

export default function Color({ color, id, editable, setError }) {
  const [saving, setSaving] = useState<boolean>(false);
  const [edit, setEdit] = useState<boolean>(false);
  const [choice, setChoice] = useState<string>(color);
  useEffect(() => {
    setChoice(color);
  }, [color]);

  const strip = (
    <div
      onClick={() => setEdit(!edit)}
      style={{
        cursor: editable ? "pointer" : undefined,
        width: "100px",
        height: "30px",
        margin: "-10px 0",
        background: choice ?? "#aaa",
      }}
    />
  );
  if (!editable) {
    return strip;
  }

  return (
    <div>
      <Space>
        {strip}
        {edit && (
          <>
            <Tooltip title="Change the compute server's color.  The color is purely cosmetic, and you can change it whenever you want.  It helps you see which compute servers is active on a given tab.">
              <Button
                type={"primary"}
                disabled={saving || color == choice}
                style={{ float: "right" }}
                onClick={async () => {
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
                  setEdit(false);
                }}
              >
                Save
                {saving && <Spin />}
              </Button>
            </Tooltip>
            <Button
              onClick={() => {
                setChoice(color);
                setEdit(false);
              }}
            >
              Cancel
            </Button>
          </>
        )}
      </Space>
      {edit && (
        <div>
          <ColorPicker color={color} onChange={setChoice} />
        </div>
      )}
    </div>
  );
}
