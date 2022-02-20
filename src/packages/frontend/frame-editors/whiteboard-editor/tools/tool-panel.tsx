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

import { CSSProperties, ReactNode, useState } from "react";
import { Button, Popover, Slider, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "../hooks";
import { debounce } from "lodash";

import { minFontSize, maxFontSize } from "./defaults";
import { SelectFontFamily } from "./edit-bar";
import ColorPicker from "@cocalc/frontend/components/color-picker";

import { ResetButton, SELECTED } from "./common";
import { Tool, TOOLS } from "./spec";
export type { Tool };

interface AllParams {
  color?: string;
  fontSize?: number;
  fontFamily?: string;
}

interface Props<Params> {
  tool: Tool;
  presetManager: PresetManager<Params>;
  Preview: (Params) => JSX.Element;
  ButtonPreview?: (Params) => JSX.Element;
  style?: CSSProperties;
}

export default function ToolPanel<Params>({
  presetManager,
  tool,
  Preview,
  ButtonPreview,
  style,
}: Props<Params>) {
  const { loadPresets, savePresets } = presetManager;
  const frame = useFrameContext();
  const [selected, setSelected] = useState<number>(
    frame.desc.get(`${tool}Id`) ?? 0
  );
  const [showEditParams, setShowEditParams] = useState<boolean>(false);
  const [presets, setPresets0] = useState<{ [id: number]: Params }>(
    loadPresets()
  );
  function setPresets(presets) {
    savePresets(presets);
    setPresets0(presets);
  }

  function PresetButton({ id }) {
    const params = presets[id] ?? presetManager.DEFAULT;
    return (
      <Button
        style={{ padding: "5px", height: "35px" }}
        type="text"
        onClick={() => {
          if (id == selected) {
            // show config selector
            setShowEditParams(!showEditParams);
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
        <Popover placement="right" content={<Preview {...params} />}>
          <div
            style={{
              border: `3px solid ${id == selected ? SELECTED : "white"}`,
              borderRadius: "3px",
            }}
          >
            {ButtonPreview != null ? (
              <ButtonPreview {...params} />
            ) : (
              <Preview {...params} />
            )}
          </div>
        </Popover>
      </Button>
    );
  }

  const presetButtons: ReactNode[] = [];
  for (let id = 0; id < presetManager.DEFAULTS.length; id++) {
    presetButtons.push(<PresetButton key={id} id={id} />);
  }

  const params = presets[selected] ?? presetManager.DEFAULT;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "75px",
        paddingBottom: "10px",
        ...style,
      }}
    >
      <Tooltip title={TOOLS[tool].tip}>
        <Button type="text">
          <Icon
            style={{ color: SELECTED, fontSize: "20px" }}
            name={TOOLS[tool].icon}
          />
        </Button>
      </Tooltip>
      <div
        style={{ maxHeight: "40vh", overflowY: "scroll", overflowX: "hidden" }}
      >
        {presetButtons}
      </div>
      <ResetButton
        onClick={() => {
          setPresets(presetManager.DEFAULTS);
        }}
      />
      {showEditParams && (
        <EditParams
          Preview={Preview}
          params={params}
          set={(name, value) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], [name]: value },
            });
          }}
        />
      )}
    </div>
  );
}

function EditParams({ params, set, Preview }) {
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
        <Preview {...params} />
      </div>
      <div style={{ width: "100%", display: "flex" }}>
        <Slider
          value={params.fontSize}
          min={minFontSize}
          max={maxFontSize}
          step={1}
          onChange={(value) => set("fontSize", value)}
          style={{ flex: "1" }}
        />
        <div style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}>
          Font size (px)
        </div>
      </div>
      <div style={{ width: "100%", display: "flex", marginBottom: "10px" }}>
        <SelectFontFamily
          onChange={(value) => set("fontFamily", value)}
          value={params.fontFamily}
          size="small"
          style={{ width: "70%", flex: 1 }}
        />
        <div style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}>
          Font family
        </div>
      </div>
      <ColorPicker
        color={params.color}
        onChange={(value) => set("color", value)}
      />
    </div>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!

interface PresetManager<Params> {
  savePresets: (presets: Params) => void;
  loadPresets: () => Params[];
  DEFAULT: Params;
  DEFAULTS: Params[];
}

const paramsMap: { [tool: Tool]: (id: number) => AllParams } = {};

export function getParams(tool: Tool, id: number) {
  return paramsMap[tool]?.(id);
}

export function getPresetManager<Params>(
  tool: Tool,
  DEFAULTS: Params[]
): PresetManager<Params> {
  const key = `whiteboard-tool-presets-${tool}`;

  let x: undefined | Params = undefined;
  for (const id in DEFAULTS) {
    x = DEFAULTS[id];
    break;
  }
  if (x == null) {
    throw Error("there must be at least one default preset");
  }
  const DEFAULT: Params = x;

  function loadPresets(): Params[] {
    try {
      const presets = JSON.parse(localStorage[key]);
      for (let id = 0; id < DEFAULTS.length; id++) {
        if (presets[id] == null) {
          presets[id] = { ...DEFAULT };
        }
        return presets;
      }
    } catch (_err) {
      // fine
    }
    return DEFAULTS;
  }

  const savePresets = debounce((presets) => {
    localStorage[key] = JSON.stringify(presets);
  }, 250);

  paramsMap[tool] = (id: number) => loadPresets()[id] ?? DEFAULT;

  return { DEFAULT, DEFAULTS, loadPresets, savePresets };
}
