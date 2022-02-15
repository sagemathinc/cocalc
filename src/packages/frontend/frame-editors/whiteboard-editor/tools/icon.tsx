/*
The icon config panel.

Icon configuration:

- name selected from the icons that are in components/icon.tsx.
- size in px
- color
*/

import { ReactNode, useState } from "react";
import { Button, Popover, Slider } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import IconSelect from "@cocalc/frontend/components/icon-select";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useFrameContext } from "../hooks";
import { debounce } from "lodash";
import { DEFAULT_FONT_SIZE, minFontSize, maxFontSize } from "./defaults";
import { ResetButton } from "./common";

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
  icon: IconName;
  fontSize?: number;
  color?: string;
}

export const DEFAULT_ICON: IconConfig = { icon: "square" };

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
    const { fontSize, color, icon } = presets[id] ?? DEFAULT_ICON;
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
        <IconToolButton
          fontSize={fontSize}
          color={color}
          icon={icon}
          borderColor={id == selected ? "blue" : "#ccc"}
        />
      </Button>
    );
  }

  const iconPresets: ReactNode[] = [];
  for (let id = 0; id < numIconTypes; id++) {
    iconPresets.push(<IconButton key={id} id={id} />);
  }

  const { fontSize, color, icon } = presets[selected] ?? DEFAULT_ICON;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "55px",
      }}
    >
      <div
        style={{ maxHeight: "50vh", overflowY: "auto", overflowX: "hidden" }}
      >
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
          icon={icon}
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
          setIcon={(icon) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], icon },
            });
          }}
        />
      )}
    </div>
  );
}

function IconToolButton({
  fontSize,
  icon,
  color,
  borderColor,
}: {
  icon: IconName;
  fontSize?: number;
  color?: string;
  borderColor?: string;
}) {
  return (
    <Popover
      placement="right"
      title={`Name: ${icon}` + (fontSize ? `, Size: ${fontSize}px` : "")}
      content={<IconPreview icon={icon} fontSize={fontSize} color={color} />}
    >
      <div
        style={{
          color,
          border: `1px solid ${borderColor ?? "#ccc"}`,
          width: "30px",
          height: "25px",
        }}
      >
        <Icon name={icon} />
      </div>
    </Popover>
  );
}

function IconPreview({
  icon,
  fontSize,
  color,
}: {
  icon: IconName;
  fontSize?: number;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <Icon name={icon} style={{ color, fontSize }} />
    </div>
  );
}

function IconParams({ color, fontSize, icon, setColor, setFontSize, setIcon }) {
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
      <div style={{ textAlign: "center" }}>
        <IconPreview icon={icon} fontSize={fontSize} color={color} />
        <br />
        {icon}
      </div>
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
          Size (px)
        </div>
      </div>
      <IconSelect
        onSelect={setIcon}
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
    presets[id] = { icon: ICONS[id] };
  }
  return presets;
}

function loadPresets() {
  try {
    const presets = JSON.parse(localStorage[key]);
    for (let id = 0; id < numIconTypes; id++) {
      if (presets[id] == null) {
        presets[id] = { icon: ICONS[id] };
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
