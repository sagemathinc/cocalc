import { Select } from "antd";
const { Option } = Select;

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
  onChange?: (hexHTMLColor: string) => void;
  style?: CSSProperties;
}
export default function ColorPicker({ color, onChange, style }: Props) {
  const [picker, setPicker] = useState<keyof typeof Pickers>("circle");
  const Picker = Pickers[picker];
  const v: ReactNode[] = [];
  for (const picker in Pickers) {
    v.push(
      <Option key={picker} value={picker}>
        {capitalize(picker)}
      </Option>
    );
  }
  return (
    <div style={style}>
      <Picker
        color={color}
        onChange={onChange != null ? (color) => onChange(color.hex) : undefined}
      />
      <Select
        value={picker}
        style={{ width: "120px", marginTop: "10px" }}
        onChange={setPicker}
      >
        {v}
      </Select>
    </div>
  );
}
