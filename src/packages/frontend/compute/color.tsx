import { Card, Spin } from "antd";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useEffect, useState } from "react";
import { setServerColor } from "./api";

interface Props {
  color: string;
  id?: number;
  editable?: boolean;
  setError;
  onChange?;
  style?;
}

export default function Color({
  color,
  id,
  editable,
  setError,
  onChange,
  style,
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
        borderRadius: "5px",
        border: `1px solid {choice ?? "#aaa"}`,
      }}
    />
  );
  if (!editable) {
    return strip;
  }

  const handleChange = async (choice) => {
    if (choice == color) {
      return;
    }
    setChoice(choice);
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
  };

  return (
    <div style={style}>
      {strip}
      {saving && <Spin delay={1000} />}
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
            <ColorPicker color={color} onChange={handleChange} />
          </Card>
        </div>
      )}
    </div>
  );
}
