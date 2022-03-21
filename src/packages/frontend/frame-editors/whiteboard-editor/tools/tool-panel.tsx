/*
Panel for a particular tool.

- Allows for a bunch of presets
- You can configure many params.
*/

import { CSSProperties, ReactNode, useState } from "react";
import { Button, Popover, Slider, TimePicker, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { CloseX } from "@cocalc/frontend/components/close-x";
import { useFrameContext } from "../hooks";
import { debounce, isEqual } from "lodash";
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from "../math";
import {
  DEFAULT_FONT_SIZE,
  minFontSize,
  maxFontSize,
  minRadius,
  maxRadius,
  defaultRadius,
} from "./defaults";
import { SelectFontFamily } from "./edit-bar";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import IconSelect from "@cocalc/frontend/components/icon-select";
import { getCountdownMoment } from "@cocalc/frontend/editors/stopwatch/stopwatch";
import { AspectRatio } from "./frame";
import { ResetButton, SELECTED } from "./common";
import { Tool, TOOLS } from "./spec";
export type { Tool };
import { ELEMENTS } from "../elements/spec";
import { Element } from "../types";
import { redux } from "@cocalc/frontend/app-framework";
import { set_account_table } from "@cocalc/frontend/account/util";

interface AllParams {
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  icon?: IconName;
  countdown?: number;
  radius?: number;
  opacity?: number;
  aspectRatio?: AspectRatio;
}

type ParamName = keyof AllParams;

interface Props<Params> {
  tool: Tool;
  presetManager: PresetManager<Params>;
  Preview: (Params) => JSX.Element;
  ButtonPreview?: (Params) => JSX.Element;
  AlternateTop?: (props: {
    setSelected: (number) => void;
    selected: number;
  }) => JSX.Element;
  style?: CSSProperties;
  editParamsStyle?: CSSProperties;
  presetStyle?: CSSProperties;
  editableParams: Set<ParamName>;
  buttonTitle?: (Params) => string;
}

export default function ToolPanel<Params>({
  presetManager,
  tool,
  Preview,
  ButtonPreview,
  AlternateTop,
  style,
  editParamsStyle,
  presetStyle,
  editableParams,
  buttonTitle,
}: Props<Params>) {
  const { loadPresets, savePresets } = presetManager;
  const frame = useFrameContext();
  const [selected, setSelected0] = useState<number>(
    frame.desc.get(`${tool}Id`) ?? 0
  );
  const setSelected = (id) => {
    setSelected0(id);
    frame.actions.set_frame_tree({
      id: frame.id,
      [`${tool}Id`]: id,
    });
  };
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
        style={{
          padding: "5px",
          height: "35px",
          ...presetStyle,
        }}
        type="text"
        onClick={() => {
          if (id == selected) {
            // toggle config selector
            setShowEditParams(!showEditParams);
          } else {
            // select this one
            setSelected(id);
          }
        }}
      >
        <Popover
          mouseEnterDelay={0.2 /* because tip obstructs column to the right */}
          mouseLeaveDelay={0}
          placement="right"
          title={
            <div style={{ textAlign: "center" }}>{buttonTitle?.(params)}</div>
          }
          content={
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Preview {...params} />
            </div>
          }
        >
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
        ...style,
      }}
    >
      {AlternateTop == null && (
        <>
          <div style={{ textAlign: "center", color: "#666", fontSize: "14px" }}>
            {TOOLS[tool].tip}
          </div>
          <Tooltip title={TOOLS[tool].tip}>
            <Button type="text">
              <Icon
                style={{ color: SELECTED, fontSize: "20px" }}
                name={TOOLS[tool].icon}
              />
            </Button>
          </Tooltip>
        </>
      )}
      {AlternateTop != null && (
        <AlternateTop selected={selected} setSelected={setSelected} />
      )}
      <div>{presetButtons}</div>
      <ResetButton
        onClick={() => {
          setPresets(presetManager.DEFAULTS);
        }}
      />
      {showEditParams && (
        <EditParams
          Preview={Preview}
          params={params}
          editableParams={editableParams}
          set={(name, value) => {
            setPresets({
              ...presets,
              [selected]: { ...presets[selected], [name]: value },
            });
          }}
          style={editParamsStyle}
          onClose={() => setShowEditParams(false)}
        />
      )}
    </div>
  );
}

function EditParams({ params, set, Preview, editableParams, style, onClose }) {
  return (
    <div
      style={{
        ...PANEL_STYLE,
        position: "absolute",
        left: "51px",
        top: 0,
        padding: "10px",
        margin: 0,
        overflowY: "auto",
        maxHeight: "70vh",
        minWidth: "300px",
        ...style,
      }}
    >
      <CloseX
        on_close={onClose}
        style={{ color: "#666", fontSize: "12px", marginTop: "-5px" }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "10px",
        }}
      >
        <Preview {...params} />
      </div>
      {editableParams.has("radius") && (
        <div style={{ width: "100%", display: "flex" }}>
          <Slider
            value={params.radius ?? defaultRadius}
            min={minRadius}
            max={maxRadius}
            step={0.5}
            onChange={(value) => set("radius", value)}
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
            Radius ({params.radius}px)
          </div>
        </div>
      )}
      {editableParams.has("opacity") && (
        <div style={{ width: "100%", display: "flex" }}>
          <Slider
            value={params.opacity ?? 1}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => set("opacity", value)}
            style={{ flex: "1" }}
          />
          <Tooltip title="Opacity: 1 is solid; less than 1 is transparent">
            <div
              style={{
                color: "#666",
                marginLeft: "5px",
                fontSize: "9pt",
                paddingTop: "6px",
              }}
            >
              Opacity ({params.opacity ?? 1})
            </div>
          </Tooltip>
        </div>
      )}
      {editableParams.has("fontSize") && (
        <div style={{ width: "100%", display: "flex" }}>
          <Slider
            value={params.fontSize ?? DEFAULT_FONT_SIZE}
            min={minFontSize}
            max={maxFontSize}
            step={1}
            onChange={(value) => set("fontSize", value)}
            style={{ flex: "1" }}
          />
          <div
            style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}
          >
            Font Size ({params.fontSize ?? DEFAULT_FONT_SIZE} px)
          </div>
        </div>
      )}
      {editableParams.has("fontFamily") && (
        <div style={{ width: "100%", display: "flex", marginBottom: "10px" }}>
          <SelectFontFamily
            onChange={(value) => set("fontFamily", value)}
            value={params.fontFamily}
            size="small"
            style={{ width: "70%", flex: 1 }}
          />
          <div
            style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}
          >
            Font Family
          </div>
        </div>
      )}
      {editableParams.has("countdown") && (
        <div style={{ width: "100%", display: "flex", marginBottom: "10px" }}>
          <div style={{ flex: 1 }}>
            <TimePicker
              defaultValue={getCountdownMoment(params.countdown)}
              onChange={(time) => {
                if (time != null) {
                  set(
                    "countdown",
                    time.seconds() +
                      time.minutes() * 60 +
                      time.hours() * 60 * 60
                  );
                } else {
                  set("countdown", null);
                }
              }}
              showNow={false}
            />
          </div>
          <div
            style={{ marginLeft: "5px", fontSize: "9pt", paddingTop: "6px" }}
          >
            Countdown From
          </div>
        </div>
      )}
      {editableParams.has("icon") && (
        <IconSelect
          onSelect={(value) => set("icon", value)}
          style={{
            maxWidth: "100%",
            marginBottom: "10px",
            maxHeight: "35vh",
            overflowY: "scroll",
          }}
        />
      )}
      {editableParams.has("color") && (
        <ColorPicker
          color={params.color}
          onChange={(value) => set("color", value)}
        />
      )}
    </div>
  );
}

interface PresetManager<Params> {
  savePresets: (presets: Params) => void;
  loadPresets: () => Params[];
  DEFAULT: Params;
  DEFAULTS: Params[];
}

const paramsMap: { [tool: Tool]: (id: number) => AllParams } = {};

export function getParams(tool: Tool, id: number): AllParams | undefined {
  return paramsMap[tool]?.(id);
}

export function getElement(tool: Tool, id: number): Partial<Element> {
  const data = getParams(tool, id);
  const type = TOOLS[tool]?.type;
  if (type == null) throw Error(`bug -- tool "${tool}" doesn't create element`);
  const element = {
    type,
    data,
    w: DEFAULT_WIDTH,
    h: DEFAULT_HEIGHT,
  };
  const updateSize = ELEMENTS[type]?.updateSize;
  if (updateSize != null) {
    updateSize(element);
  }
  return element;
}

export function getPresetManager<Params>(
  tool: Tool,
  DEFAULTS: Params[],
  extraIds?: { [id: number]: Params } // typical for negative id's; hardcoded.
): PresetManager<Params> {
  const key = `whiteboard_${tool}`;

  let x: undefined | Params = undefined;
  for (const id in DEFAULTS) {
    x = DEFAULTS[id];
    break;
  }
  if (x == null) {
    throw Error("there must be at least one default preset");
  }
  const DEFAULT: Params = x; // the *first* default.

  function loadPresets(): Params[] {
    let changed: { [id: number]: Params } = {};
    try {
      changed = JSON.parse(
        redux.getStore("account").getIn(["editor_settings", key], "{}")
      );
    } catch (_err) {
      changed = {};
    }
    const presets: Params[] = [];
    for (let id = 0; id < DEFAULTS.length; id++) {
      presets.push(changed[id] ?? { ...DEFAULTS[id] });
    }
    return presets;
  }

  const savePresets = debounce((presets) => {
    const v: any = {};
    for (let id = 0; id < DEFAULTS.length; id++) {
      if (!isEqual(presets[id], DEFAULTS[id])) {
        v[id] = presets[id];
      }
    }
    const val = JSON.stringify(v);
    set_account_table({ editor_settings: { [key]: val } });
  }, 250);

  paramsMap[tool] = (id: number) => {
    const a = extraIds?.[id];
    if (a != null) {
      return a;
    }
    return loadPresets()[id] ?? DEFAULT;
  };

  return { DEFAULT, DEFAULTS, loadPresets, savePresets };
}
