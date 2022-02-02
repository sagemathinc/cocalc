/*
The pen panel.
*/

import { ReactNode, useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useFrameContext } from "../hooks";
import { debounce } from "lodash";
import { ResetButton } from "./note";

// Standard 12 original sharpie colors
//www.jennyscrayoncollection.com/2021/04/complete-list-of-sharpie-marker-colors.html
http: const COLORS = [
  "#95067a",
  "#2b6855",
  "#53b79c",
  "#252937",
  "#c1003c",
  "#82bc0e",
  "#009ac1",
  "#411a09",
  "#db482d",
  "#e0d200",
  "#002bdb",
  "#6a4acb",
];
const RADS = [1, 7];

const HIGHLIGHTER = -1;
const ERASER = -2;

export const minRadius = 0.5;
export const maxRadius = 15;
const numBrushes = COLORS.length * RADS.length;
const DEFAULT_PEN = { radius: 1, color: "black" };

export default function Pen() {
  const frame = useFrameContext();
  const [selected, setSelected0] = useState<number>(
    frame.desc.get("penId") ?? 0
  );
  const setSelected = (id) => {
    setSelected0(id);
    frame.actions.set_frame_tree({ id: frame.id, penId: id });
  };
  const [paramControls, setParamControls] = useState<boolean>(false);
  const [presets, setPresets0] = useState<Presets>(loadPresets());

  function setPresets(presets) {
    setPresets0(presets);
    savePresets(presets);
  }

  function BrushButton({ id }) {
    const { radius, color } = presets[id] ?? DEFAULT_PEN;
    return (
      <Tooltip title={`Color: ${color}, Radius: ${radius}px`} placement="right">
        <Button
          style={{ paddingLeft: "3px", marginTop: "-15px" }}
          type="text"
          onClick={() => {
            if (id == selected) {
              // show color selector
              setParamControls(!paramControls);
            } else {
              // select this one
              setSelected(id);
            }
          }}
        >
          <BrushPreset
            radius={radius}
            color={color}
            selectedColor={id == selected ? "#ccc" : undefined}
          />
        </Button>
      </Tooltip>
    );
  }

  const brushes: ReactNode[] = [];
  for (let id = 0; id < numBrushes; id++) {
    brushes.push(<BrushButton key={id} id={id} />);
  }

  const { radius, color, opacity } = presets[selected] ?? {
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
      <Tooltip title="Pen" placement="right">
        <Button type="text" onClick={() => setSelected(0)}>
          <Icon
            style={{ color: selected >= 0 ? "blue" : undefined }}
            name="pencil"
          />
        </Button>
      </Tooltip>
      <Tooltip title="Highlighter" placement="right">
        <Button type="text" onClick={() => setSelected(HIGHLIGHTER)}>
          <Icon
            style={{ color: selected == HIGHLIGHTER ? "blue" : undefined }}
            name="blog"
          />
        </Button>
      </Tooltip>
      <Tooltip title="Erase" placement="right">
        <Button type="text" onClick={() => setSelected(ERASER)}>
          <Icon
            style={{ color: selected == ERASER ? "blue" : undefined }}
            name="eraser"
          />
        </Button>
      </Tooltip>
      <div
        style={{ maxHeight: "40vh", overflowY: "scroll", paddingTop: "15px" }}
      >
        {brushes}
      </div>
      <ResetButton
        onClick={() => {
          setPresets(defaultPresets());
        }}
      />
      {paramControls && (
        <PenParams
          color={color}
          radius={radius}
          opacity={opacity}
          setColor={(color) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], color },
            });
          }}
          setRadius={(radius) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], radius },
            });
          }}
          setOpacity={(opacity) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], opacity },
            });
          }}
        />
      )}
    </div>
  );
}

function BrushPreset({
  radius,
  color,
  selectedColor,
}: {
  radius: number;
  color: string;
  selectedColor?: string;
}) {
  return (
    <div style={{ background: selectedColor, padding: "2.5px" }}>
      <BrushPreview radius={radius} color={color} />
    </div>
  );
}

export function BrushPreview({
  radius,
  color,
}: {
  radius: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: `${(maxRadius + 1) * 2}px`,
        height: `${(maxRadius + 1) * 2}px`,
        borderRadius: `${maxRadius + 1}px`,
        background: "white",
        border: `1px solid ${color ?? "#ccc"}`,
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

function PenParams({
  color,
  radius,
  setColor,
  setRadius,
  opacity,
  setOpacity,
}) {
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
        <div
          style={{
            color: "#666",
            marginLeft: "5px",
            fontSize: "9pt",
            paddingTop: "6px",
          }}
        >
          Radius ({radius}px)
        </div>
      </div>
      <div style={{ width: "100%", display: "flex" }}>
        <Slider
          value={opacity ?? 1}
          min={0}
          max={1}
          step={0.01}
          onChange={setOpacity}
          style={{ flex: "1" }}
        />
        <Tooltip title="Opacity: If 1 line is solid; if smaller then line is transparent">
          <div
            style={{
              color: "#666",
              marginLeft: "5px",
              fontSize: "9pt",
              paddingTop: "6px",
            }}
          >
            Opacity ({opacity ?? 1})
          </div>
        </Tooltip>
      </div>
      <ColorPicker color={color} onChange={setColor} />
    </div>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!
type Presets = {
  [id: string]: { color: string; radius: number; opacity?: number };
};

const key = "whiteboard-pen-presets";

function kthPreset(k) {
  return {
    radius: RADS[k % RADS.length],
    color: COLORS[Math.floor(k / RADS.length) % COLORS.length] ?? "#000",
  };
}

function defaultPresets() {
  const presets: Presets = {};
  for (let id = 0; id < numBrushes; id++) {
    presets[id] = kthPreset(id);
  }
  return presets;
}

function loadPresets() {
  try {
    const presets = JSON.parse(localStorage[key]);
    for (let id = 0; id < numBrushes; id++) {
      if (presets[id] == null) {
        presets[id] = kthPreset(id);
      }
      return presets;
    }
  } catch (_err) {
    // fine
  }
  return defaultPresets();
}

const savePresets = debounce((presets) => {
  localStorage[key] = JSON.stringify(presets);
}, 250);

export function penParams(id: number) {
  if (id == HIGHLIGHTER) {
    return { color: "#ffff00", opacity: 0.4, radius: 15 };
  }
  if (id == ERASER) {
    return { color: "#ffffff", radius: 15 };
  }
  return loadPresets()[id] ?? DEFAULT_PEN;
}
