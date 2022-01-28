/*
The pen panel.
*/

import { ReactNode, useState } from "react";
import { Button, Select, Slider, Tooltip } from "antd";
const { Option } = Select;
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  CirclePicker,
  ChromePicker,
  PhotoshopPicker,
  GithubPicker,
  TwitterPicker,
  SwatchesPicker,
} from "react-color";
import { capitalize } from "@cocalc/util/misc";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { debounce } from "lodash";

const minRadius = 0.5;
const maxRadius = 15;
const numBrushes = 5;
const DEFAULT_PEN = { radius: 1, color: "black" };

export default function Pen() {
  const frame = useFrameContext();
  const [selected, setSelected] = useState<number>(
    frame.desc.get("penId") ?? 0
  );
  const [paramControls, setParamControls] = useState<boolean>(false);
  const [presets, setPresets] = useState<Presets>(loadPresets());

  function BrushButton({ id }) {
    const { radius, color } = presets[id] ?? DEFAULT_PEN;
    return (
      <Button
        style={{ paddingLeft: "7px", marginTop: "4px" }}
        type="text"
        onClick={() => {
          if (id == selected) {
            // show color selector
            setParamControls(!paramControls);
          } else {
            // select this one
            setSelected(id);
            frame.actions.set_frame_tree({ id: frame.id, penId: id });
          }
        }}
      >
        <BrushPreview
          radius={radius}
          color={color}
          borderColor={id == selected ? "blue" : "#ccc"}
        />
      </Button>
    );
  }

  const brushes: ReactNode[] = [];
  for (let id = 0; id < numBrushes; id++) {
    brushes.push(<BrushButton key={id} id={id} />);
  }

  const { radius, color } = presets[selected] ?? {
    radius: 0.5,
    color: "black",
  };

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "46px",
        paddingBottom: "10px",
      }}
    >
      <Tooltip title="Pen">
        <Button type="text">
          <Icon style={{ color: "blue" }} name="pencil" />
        </Button>
      </Tooltip>
      <Tooltip title="Highlighter">
        <Button type="text">
          <Icon name="blog" />
        </Button>
      </Tooltip>
      <Tooltip title="Erase">
        <Button type="text">
          <Icon name="eraser" />
        </Button>
      </Tooltip>

      {brushes}
      {paramControls && (
        <PenParams
          color={color}
          radius={radius}
          setColor={(color) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], color },
            });
            savePresets(presets);
          }}
          setRadius={(radius) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], radius },
            });
            savePresets(presets);
          }}
        />
      )}
    </div>
  );
}

function BrushPreview({
  radius,
  color,
  borderColor,
}: {
  radius: number;
  color: string;
  borderColor?: string;
}) {
  return (
    <div
      style={{
        width: `${(maxRadius + 1) * 2}px`,
        height: `${(maxRadius + 1) * 2}px`,
        borderRadius: `${maxRadius + 1}px`,
        background: "white",
        border: `1px solid ${borderColor ?? "#ccc"}`,
        paddingLeft: `${maxRadius + 1 - radius - 1}px`,
        paddingTop: `${maxRadius + 1 - radius - 1}px`,
      }}
    >
      <div
        style={{
          width: `${radius * 2}px`,
          height: `${radius * 2}px`,
          borderRadius: `${radius}px`,
          background: color,
        }}
      ></div>
    </div>
  );
}

const Pickers = {
  circle: CirclePicker,
  photoshop: PhotoshopPicker,
  chrome: ChromePicker,
  github: GithubPicker,
  twitter: TwitterPicker,
  swatches: SwatchesPicker,
};

function PenParams({ color, radius, setColor, setRadius }) {
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
    <div
      style={{
        ...PANEL_STYLE,
        position: "absolute",
        left: "51px",
        top: 0,
        padding: "10px",
        margin: 0,
      }}
    >
      <div style={{ width: "100%", display: "flex" }}>
        <Slider
          value={radius}
          min={minRadius}
          max={maxRadius}
          step={0.5}
          onChange={setRadius}
          style={{ flex: "1" }}
        />
        <div style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}>
          Radius
        </div>
      </div>
      <Picker color={color} onChange={(color) => setColor(color.hex)} />
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

// For now just storing these presets in localStorage.
// TODO: move to account settings?
type Presets = { [id: string]: { color: string; radius: number } };

const key = "whiteboard-pen-presets";
const COLORS = ["black", "red", "green", "blue", "yellow"];
function loadPresets() {
  try {
    const presets = JSON.parse(localStorage[key]);
    for (let id = 0; id < numBrushes; id++) {
      if (presets[id] == null) {
        presets[id] = { radius: 2 * id + 1, color: COLORS[id] };
      }
      return presets;
    }
  } catch (_err) {
    // fine
  }
  const presets: Presets = {};
  for (let id = 0; id < numBrushes; id++) {
    presets[id] = { radius: 2 * id + 1, color: COLORS[id] };
  }
  return presets;
}

const savePresets = debounce((presets) => {
  localStorage[key] = JSON.stringify(presets);
}, 250);

export function penParams(id: number) {
  return loadPresets()[id] ?? DEFAULT_PEN;
}
