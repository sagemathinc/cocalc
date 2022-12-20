import ColorPicker from "@cocalc/frontend/components/color-picker";
import { render } from "./register";
import { useEffect, useState } from "react";
import { useEditableContext } from "./context";
import { Button, Popover, Space } from "antd";
import { BrushPreview } from "../../whiteboard-editor/tools/pen";

function Color({ color }) {
  return color ? <BrushPreview radius={32} color={color} /> : null;
}

render({ type: "color", editable: false }, ({ field, obj }) => (
  <Color color={obj[field]} />
));

render({ type: "color", editable: true }, ({ field, obj, spec }) => {
  if (spec.type != "color" || !spec.editable) {
    throw Error("bug");
  }
  const [color, setColor] = useState<string>(obj[field]);
  const { counter, error, edit, setEdit, save } =
    useEditableContext<string>(field);

  useEffect(() => {
    setColor(obj[field]);
  }, [counter]);

  return (
    <span>
      <Popover
        open={edit}
        onOpenChange={setEdit}
        trigger="click"
        title={
          <div style={{ textAlign: "center" }}>
            Select Color{" "}
            <Space style={{ float: "right" }}>
              <Button
                size="small"
                onClick={() => {
                  setColor("");
                  save(obj, null);
                  setEdit(false);
                }}
              >
                Clear
              </Button>
              <Button size="small" onClick={() => setEdit(false)}>
                Done
              </Button>
            </Space>
          </div>
        }
        content={() => {
          return (
            <ColorPicker
              onChange={(color) => {
                setColor(color);
                save(obj, color);
              }}
            />
          );
        }}
      >
        <span style={{ cursor: "pointer" }}>
          {color ? (
            <Color color={color} />
          ) : (
            <span style={{ color: "#999" }}>Color...</span>
          )}
        </span>
      </Popover>
      {error}
    </span>
  );
});
