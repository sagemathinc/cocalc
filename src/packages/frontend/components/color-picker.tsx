import { Button, Modal, Select } from "antd";
const { Option } = Select;
import { Icon } from "./icon";

import { CSSProperties, ReactNode, useState } from "react";
import {
  CirclePicker,
  ChromePicker,
  PhotoshopPicker,
  GithubPicker,
  TwitterPicker,
  SwatchesPicker,
  SketchPicker,
  BlockPicker,
  SliderPicker,
  CompactPicker,
} from "react-color";

import { capitalize } from "@cocalc/util/misc";

const Pickers = {
  circle: CirclePicker,
  photoshop: PhotoshopPicker,
  chrome: ChromePicker,
  github: GithubPicker,
  twitter: TwitterPicker,
  swatches: SwatchesPicker,
  sketch: SketchPicker,
  block: BlockPicker,
  slider: SliderPicker,
  compact: CompactPicker,
};

interface Props {
  color?: string;
  onChange?: (htmlColor: string) => void;
  style?: CSSProperties;
  defaultPicker?: keyof typeof Pickers;
  toggle?: ReactNode;
  justifyContent?: "flex-start" | "flex-end" | "center";
}
export default function ColorPicker({
  color,
  onChange,
  style,
  defaultPicker,
  toggle,
  justifyContent = "center",
}: Props) {
  const [visible, setVisible] = useState<boolean>(!toggle);
  const [picker, setPicker] = useState<keyof typeof Pickers>(
    defaultPicker ?? localStorage["defaultColorPicker"] ?? "circle"
  );
  const Picker = Pickers[picker];
  const v: ReactNode[] = [];
  for (const picker in Pickers) {
    v.push(
      <Option key={picker} value={picker}>
        {capitalize(picker)}
      </Option>
    );
  }
  if (!visible && toggle) {
    return (
      <div onClick={() => setVisible(true)} style={{ cursor: "pointer" }}>
        {toggle}
      </div>
    );
  }
  return (
    <div style={style}>
      {toggle && (
        <div
          style={{ float: "right", cursor: "pointer" }}
          onClick={() => setVisible(false)}
        >
          <Icon name={"times"} />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent,
          overflowX: "auto",
        }}
      >
        <Picker
          color={color}
          onChange={
            onChange != null ? (color) => onChange(color.hex) : undefined
          }
        />
      </div>
      <div>
        <div
          style={{
            float: "right",
            fontSize: "12px",
            marginTop: "20px",
            color: "#666",
          }}
        >
          Color Picker
        </div>
        <Select
          value={picker}
          style={{ width: "120px", marginTop: "10px" }}
          onChange={(picker) => {
            setPicker(picker);
            localStorage["defaultColorPicker"] = picker;
          }}
        >
          {v}
        </Select>
      </div>
    </div>
  );
}

interface ButtonProps {
  onChange: (htmlColor: string) => void;
  title?: ReactNode;
}
export function ColorButton({ onChange, title }: ButtonProps) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <>
      <Modal
        title={title ?? "Select a Color"}
        visible={show}
        onOk={() => setShow(false)}
        onCancel={() => setShow(false)}
      >
        <ColorPicker
          onChange={(color) => {
            onChange(color);
            setShow(false);
          }}
        />
      </Modal>
      <Button onClick={() => setShow(!show)}>
        <Icon name="colors" />
      </Button>
    </>
  );
}
