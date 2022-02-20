/*
Panel for a particular tool.

- Allows for a bunch of presets
- You can configure each one with a subset of spec.ConfigParams:
   - fontSize
   - fontFamily
   - color
   - radius
   - countdown
*/

import { ReactNode, useState } from "react";
import { Button, Popover, Slider, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "../hooks";
import { debounce } from "lodash";

import { COLORS } from "./pen";

import { DEFAULT_FONT_SIZE, minFontSize, maxFontSize } from "./defaults";
import { SelectFontFamily } from "./edit-bar";
import ColorPicker from "@cocalc/frontend/components/color-picker";

import { ResetButton } from "./common";
import type { Tool } from "./spec";
export type { Tool };

const numTextTypes = COLORS.length;

interface Props<Params> {
  tool: Tool;
  presetManager: PresetManager<Params>;
}

export default function ToolPanel<Params>({
  presetManager,
  tool,
}: Props<Params>) {
  const { defaultPresets, defaultPreset, loadPresets, savePresets } =
    presetManager;
  const frame = useFrameContext();
  const [selected, setSelected] = useState<number>(
    frame.desc.get(`${tool}Id`) ?? 0
  );
  const [paramControls, setParamControls] = useState<boolean>(false);
  const [presets, setPresets0] = useState<{ [id: number]: Params }>(
    loadPresets()
  );
  function setPresets(presets) {
    savePresets(presets);
    setPresets0(presets);
  }

  function TextButton({ id }) {
    const params = presets[id] ?? defaultPreset;
    return (
      <Button
        style={{ padding: "5px", height: "35px" }}
        type="text"
        onClick={() => {
          if (id == selected) {
            // show note config selector
            setParamControls(!paramControls);
          } else {
            // select this one
            setSelected(id);
            frame.actions.set_frame_tree({
              id: frame.id,
              [`${tool}Id`]: id,
            });
          }
        }}
      >
        <TextToolButton
          {...params}
          borderColor={id == selected ? "blue" : "#ccc"}
        />
      </Button>
    );
  }

  const notePresets: ReactNode[] = [];
  for (let id = 0; id < numTextTypes; id++) {
    notePresets.push(<TextButton key={id} id={id} />);
  }

  const params = presets[selected] ?? defaultPreset;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "75px",
        paddingBottom: "10px",
      }}
    >
      <Tooltip title="Text">
        <Button type="text">
          <Icon style={{ color: "blue" }} name="note" />
        </Button>
      </Tooltip>
      <div
        style={{ maxHeight: "40vh", overflowY: "scroll", overflowX: "hidden" }}
      >
        {notePresets}
      </div>
      <ResetButton
        onClick={() => {
          setPresets(defaultPresets());
        }}
      />
      {paramControls && (
        <TextParams
          {...params}
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
          setFontFamily={(fontFamily) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], fontFamily },
            });
          }}
        />
      )}
    </div>
  );
}

function TextToolButton({
  fontSize,
  fontFamily,
  color,
  borderColor,
}: {
  fontSize: number;
  fontFamily?: string;
  color: string;
  borderColor?: string;
}) {
  return (
    <Popover
      placement="right"
      content={
        <TextPreview
          fontSize={fontSize}
          fontFamily={fontFamily}
          color={color}
        />
      }
    >
      <div
        style={{
          padding: 0,
          margin: 0,
          border: `2px solid ${borderColor ?? "#ccc"}`,
          width: "50px",
          height: "25px",
          fontSize: "14px",
          fontFamily,
          fontWeight: "bold",
          color,
        }}
      >
        A
      </div>
    </Popover>
  );
}

function TextPreview({ fontSize, fontFamily, color }) {
  return (
    <div
      style={{
        margin: "auto",
        width: "200px",
        height: `${fontSize + 20}px`,
        fontSize: `${fontSize ?? DEFAULT_FONT_SIZE}px`,
        fontFamily,
        color,
        textAlign: "center",
      }}
    >
      Text
    </div>
  );
}

function TextParams({
  color,
  fontSize,
  fontFamily,
  setColor,
  setFontSize,
  setFontFamily,
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
      <div style={{ textAlign: "center" }}>
        <TextPreview
          fontSize={fontSize}
          fontFamily={fontFamily}
          color={color}
        />
      </div>
      <div style={{ width: "100%", display: "flex" }}>
        <Slider
          value={fontSize}
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
      <div style={{ width: "100%", display: "flex", marginBottom: "10px" }}>
        <SelectFontFamily
          onChange={setFontFamily}
          value={fontFamily}
          size="small"
          style={{ width: "70%", flex: 1 }}
        />
        <div style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}>
          Font family
        </div>
      </div>
      <ColorPicker color={color} onChange={setColor} defaultPicker="swatches" />
    </div>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!

interface PresetManager<Params> {
  savePresets: (presets: Params) => void;
  loadPresets: () => { [id: number]: Params };
  getPreset: (id: number) => Params;
  defaultPresets: () => { [id: number]: Params };
  defaultPreset: Params;
}

export function getPresetManager<Params>(
  tool: Tool,
  defaultPreset: Params
): PresetManager<Params> {
  const key = `whiteboard-presets-${tool}`;

  function defaultPresets(): { [id: string]: Params } {
    const presets: { [id: string]: Params } = {};
    for (let id = 0; id < numTextTypes; id++) {
      presets[id] = { ...defaultPreset, color: COLORS[id] };
    }
    return presets;
  }

  function loadPresets(): { [id: string]: Params } {
    try {
      const presets = JSON.parse(localStorage[key]);
      for (let id = 0; id < numTextTypes; id++) {
        if (presets[id] == null) {
          presets[id] = { ...defaultPreset, color: COLORS[id] };
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

  function getPreset(id: number): Params {
    return loadPresets()[id] ?? defaultPreset;
  }

  return { defaultPresets, getPreset, loadPresets, savePresets, defaultPreset };
}
