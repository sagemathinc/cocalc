/*
The note config panel.
*/

import { ReactNode, useState } from "react";
import { Button, Popconfirm, Slider, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { debounce } from "lodash";
import { STYLE } from "../elements/note";
import { DEFAULT_FONT_SIZE, minFontSize, maxFontSize } from "./defaults";


// see https://www.post-it.com/3M/en_US/post-it/ideas/color/
export const COLORS = [
  "#f5f468",
  "#e8edfa",
  "#f5e3ad",
  "#7ae294",
  "#4dd1f1",
  "#fdaf8a",
  "#f9b2c3",
  "#a8cc67",
  "#fe871c",
  "#fdce04",
  "#cfec6d",
  "#fe5b60",
  "#c1bab9",
  "#99b1f0",
];
const numNoteTypes = COLORS.length;
export const DEFAULT_NOTE = { fontSize: DEFAULT_FONT_SIZE, color: COLORS[0] };

export default function NoteToolPanel() {
  const frame = useFrameContext();
  const [selected, setSelected] = useState<number>(
    frame.desc.get("noteId") ?? 0
  );
  const [paramControls, setParamControls] = useState<boolean>(false);
  const [presets, setPresets0] = useState<Presets>(loadPresets());

  function setPresets(presets) {
    setPresets0(presets);
    savePresets(presets);
  }

  function NoteButton({ id }) {
    const { fontSize, color } = presets[id] ?? DEFAULT_NOTE;
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
            frame.actions.set_frame_tree({ id: frame.id, noteId: id });
          }
        }}
      >
        <NotePreview
          fontSize={fontSize}
          color={color}
          borderColor={id == selected ? "blue" : "#ccc"}
        />
      </Button>
    );
  }

  const notePresets: ReactNode[] = [];
  for (let id = 0; id < numNoteTypes; id++) {
    notePresets.push(<NoteButton key={id} id={id} />);
  }

  const { fontSize, color } = presets[selected] ?? DEFAULT_NOTE;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "63px",
        paddingBottom: "10px",
      }}
    >
      <Tooltip title="Note">
        <Button type="text">
          <Icon style={{ color: "blue" }} name="note" />
        </Button>
      </Tooltip>
      <div style={{ maxHeight: "50vh", overflowY: "scroll" }}>
        {notePresets}
      </div>
      <ResetButton
        onClick={() => {
          setPresets(defaultPresets());
        }}
      />
      {paramControls && (
        <NoteParams
          color={color}
          fontSize={fontSize}
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
        />
      )}
    </div>
  );
}

function NotePreview({
  fontSize,
  color,
  borderColor,
}: {
  fontSize: number;
  color: string;
  borderColor?: string;
}) {
  return (
    <Tooltip title={`Font size: ${fontSize}px`}>
      <div
        style={{
          ...STYLE,
          padding: 0,
          margin: 0,
          background: color,
          border: `2px solid ${borderColor ?? "#ccc"}`,
          width: "50px",
          height: "25px",
          fontSize: "8pt",
          color: "#888",
        }}
      ></div>
    </Tooltip>
  );
}

function NoteParams({ color, fontSize, setColor, setFontSize }) {
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
        <Button
          type="text"
          style={{ color: "#666", marginTop: "8px", paddingLeft: "4px" }}
        >
          Reset
        </Button>
      </Popconfirm>
    </Tooltip>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!
// Same problem with pen params.
type Presets = { [id: string]: { color: string; fontSize: number } };

const key = "whiteboard-note-presets";

function defaultPresets() {
  const presets: Presets = {};
  for (let id = 0; id < numNoteTypes; id++) {
    presets[id] = { ...DEFAULT_NOTE, color: COLORS[id] };
  }
  return presets;
}

function loadPresets() {
  try {
    const presets = JSON.parse(localStorage[key]);
    for (let id = 0; id < numNoteTypes; id++) {
      if (presets[id] == null) {
        presets[id] = { ...DEFAULT_NOTE, color: COLORS[id] };
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

export function noteParams(id: number) {
  return loadPresets()[id] ?? DEFAULT_NOTE;
}
