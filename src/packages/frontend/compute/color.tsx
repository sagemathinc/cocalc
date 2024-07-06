import { Button, Card, Spin } from "antd";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useEffect, useState } from "react";
import { setServerColor } from "./api";
import { Icon } from "@cocalc/frontend/components";

interface Props {
  color: string;
  id?: number;
  editable?: boolean;
  setError?;
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
        height: "32px",
        background: choice ?? "#aaa",
        borderRadius: "5px",
        border: `1px solid #ddd`,
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
        setError?.(`${err}`);
      } finally {
        setSaving(false);
      }
    }
    setEdit(false);
  };

  return (
    <div style={{ display: "flex", ...style }}>
      {editable && (
        <Button
          type="text"
          onClick={() => {
            handleChange(randomColor());
          }}
        >
          <Icon name="sync-alt" />
        </Button>
      )}
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

export function randomColor() {
  return `rgb(${Math.floor(Math.random() * 256)},${Math.floor(
    Math.random() * 256,
  )},${Math.floor(Math.random() * 256)})`;
}
