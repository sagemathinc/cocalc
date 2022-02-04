/*
The icon config panel.

Icon configuration:

- name selected from the icons that are in components/icon.tsx.
- size in px
- color
*/

import { ReactNode, useState } from "react";
import { Button, Popconfirm, Popover, Slider, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import IconSelect from "@cocalc/frontend/components/icon-select";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useFrameContext } from "../hooks";
import { debounce } from "lodash";
import { DEFAULT_FONT_SIZE, minFontSize, maxFontSize } from "./defaults";

const ICONS: IconName[] = [
  "square",
  "circle",
  "jupyter",
  "sagemath",
  "tex",
  "bug",
  "bolt",
  "bullhorn",
  "calculator",
  "cocalc-ring",
  "exchange",
  "exclamation-triangle",
  "graduation-cap",
  "python",
  "r",
  "user",
];

const numIconTypes = ICONS.length;

interface IconConfig {
  name: IconName;
  fontSize?: number;
  color?: string;
}

export const DEFAULT_ICON: IconConfig = { name: "square" };

export default function IconToolPanel() {
  const frame = useFrameContext();
  const [selected, setSelected] = useState<number>(
    frame.desc.get("iconId") ?? 0
  );
  const [paramControls, setParamControls] = useState<boolean>(false);
  const [presets, setPresets0] = useState<Presets>(loadPresets());

  function setPresets(presets) {
    setPresets0(presets);
    savePresets(presets);
  }

  function IconButton({ id }) {
    const { fontSize, color, name } = presets[id] ?? DEFAULT_ICON;
    return (
      <Button
        style={{ padding: "5px", height: "35px" }}
        type="text"
        onClick={() => {
          if (id == selected) {
            // show color selector
            setParamControls(!paramControls);
          } else {
            // select this one
            setSelected(id);
            frame.actions.set_frame_tree({ id: frame.id, iconId: id });
          }
        }}
      >
        <IconPreview
          fontSize={fontSize}
          color={color}
          name={name}
          borderColor={id == selected ? "blue" : "#ccc"}
        />
      </Button>
    );
  }

  const iconPresets: ReactNode[] = [];
  for (let id = 0; id < numIconTypes; id++) {
    iconPresets.push(<IconButton key={id} id={id} />);
  }

  const { fontSize, color, name } = presets[selected] ?? DEFAULT_ICON;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "42px",
      }}
    >
      <div style={{ maxHeight: "50vh", overflowY: "scroll" }}>
        {iconPresets}
      </div>
      <ResetButton
        onClick={() => {
          setPresets(defaultPresets());
        }}
      />
      {paramControls && (
        <IconParams
          color={color}
          fontSize={fontSize}
          name={name}
          setColor={(color) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], color },
            });
          }}
          setFontSize={(fontSize) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], fontSize },
            });
          }}
          setName={(name) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], name },
            });
          }}
        />
      )}
    </div>
  );
}

function IconPreview({
  fontSize,
  name,
  color,
  borderColor,
}: {
  name: IconName;
  fontSize?: number;
  color?: string;
  borderColor?: string;
}) {
  return (
    <Popover
      placement="right"
      title={`Name: ${name}` + (fontSize ? `, Font size: ${fontSize}px` : "")}
      content={
        <div style={{ textAlign: "center" }}>
          <Icon name={name} style={{ color, fontSize }} />
        </div>
      }
    >
      <div
        style={{
          color,
          border: `1px solid ${borderColor ?? "#ccc"}`,
          width: "30px",
          height: "25px",
        }}
      >
        <Icon name={name} />
      </div>
    </Popover>
  );
}

function IconParams({ color, fontSize, name, setColor, setFontSize, setName }) {
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
          value={fontSize ?? DEFAULT_FONT_SIZE}
          min={minFontSize}
          max={maxFontSize}
          step={1}
          onChange={setFontSize}
          style={{ flex: "1" }}
        />
        <div style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}>
          Font size (px)
        </div>
      </div>
      <IconSelect
        onSelect={setName}
        defaultSearch={name}
        style={{
          maxWidth: "100%",
          marginBottom: "10px",
          maxHeight: "50vh",
          overflowY: "scroll",
        }}
      />
      <ColorPicker color={color} onChange={setColor} defaultPicker="swatches" />
    </div>
  );
}

export function ResetButton({ onClick }) {
  return (
    <Tooltip title="Reset to defaults">
      <Popconfirm
        title="Are you sure you want to reset the presets to their default settings?"
        onConfirm={onClick}
      >
        <Button type="text" style={{ color: "#666", paddingLeft: "2px" }}>
          Reset
        </Button>
      </Popconfirm>
    </Tooltip>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!
// Same problem with pen params.
type Presets = {
  [id: string]: IconConfig;
};

const key = "whiteboard-icon-presets";

function defaultPresets() {
  const presets: Presets = {};
  for (let id = 0; id < numIconTypes; id++) {
    presets[id] = { name: ICONS[id] };
  }
  return presets;
}

function loadPresets() {
  try {
    const presets = JSON.parse(localStorage[key]);
    for (let id = 0; id < numIconTypes; id++) {
      if (presets[id] == null) {
        presets[id] = { name: ICONS[id] };
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

export function iconParams(id: number) {
  return loadPresets()[id] ?? DEFAULT_ICON;
}
