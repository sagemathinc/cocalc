import { Button, Card, Space, Spin, Tooltip } from "antd";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useEffect, useState } from "react";
import { setServerColor } from "./api";

interface Props {
  color: string;
  id?: number;
  editable?: boolean;
  setError;
  onChange?;
}

export default function Color({
  color,
  id,
  editable,
  setError,
  onChange,
}: Props) {
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
        width: "125px",
        height: "30px",
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
            <Button
              onClick={() => {
                setChoice(color);
                setEdit(false);
              }}
            >
              Cancel
            </Button>
            <Tooltip title="Change the compute server's color.  The color is purely cosmetic, and you can change it whenever you want.  It helps you see which compute servers is active on a given tab.">
              <Button
                type={"primary"}
                disabled={saving || color == choice}
                style={{ float: "right" }}
                onClick={async () => {
                  if (choice == color) {
                    return;
                  }
                  if (onChange != null) {
                    onChange(choice);
                  }
                  if (id != null) {
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
                  setEdit(false);
                }}
              >
                Save
                {saving && <Spin />}
              </Button>
            </Tooltip>
          </>
        )}
      </Space>
      {edit && (
        <div style={{ position: "relative" }}>
          <Card
            style={{
              position: "absolute",
              zIndex: 100,
              background: "white",
              border: "1px solid #aaa",
              boxShadow: "4px 4px 2px #aaa",
            }}
          >
            <ColorPicker color={color} onChange={setChoice} />
          </Card>
        </div>
      )}
    </div>
  );
}
