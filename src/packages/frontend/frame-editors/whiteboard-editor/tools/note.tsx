/*
The note config panel.
*/

import { ReactNode, useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { debounce } from "lodash";
import { STYLE } from "../elements/note";

const minFontSize = 7;
const maxFontSize = 64;

const COLORS = [
  "#fff9b1",
  "#f5f6f8",
  "#d4f692",
  "#f5d027",
  "#c9de55",
  "#fe9d47",
  "#93d174",
  "#6cd7fa",
  "#fecedf",
  "#a6ccf5",
  "#000000",
];
const numNoteTypes = COLORS.length;
export const DEFAULT_NOTE = { fontSize: 14, color: COLORS[0] };

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
        style={{ padding: "5px" }}
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

  const notes: ReactNode[] = [];
  for (let id = 0; id < numNoteTypes; id++) {
    notes.push(<NoteButton key={id} id={id} />);
  }

  const { fontSize, color } = presets[selected] ?? DEFAULT_NOTE;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "66px",
        paddingBottom: "10px",
      }}
    >
      <Tooltip title="Note">
        <Button type="text">
          <Icon style={{ color: "blue" }} name="note" />
        </Button>
      </Tooltip>
      {notes}
      <ResetButton />
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
    <div
      style={{
        ...STYLE,
        padding: 0,
        margin: 0,
        background: color,
        border: `2px solid ${borderColor ?? "#ccc"}`,
        width: "50px",
        height: "25px",
      }}
    >
      {fontSize}px
    </div>
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
      <ColorPicker color={color} onChange={setColor} defaultPicker="twitter" />
    </div>
  );
}

function ResetButton() {
  return (
    <Tooltip title="Reset to default colors and size">
      <Button type="text" style={{ color: "#888", marginTop: "8px" }}>
        Reset
      </Button>
    </Tooltip>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!
// Same problem with pen params.
type Presets = { [id: string]: { color: string; fontSize: number } };

const key = "whiteboard-note-presets";

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
  const presets: Presets = {};
  for (let id = 0; id < numNoteTypes; id++) {
    presets[id] = { ...DEFAULT_NOTE, color: COLORS[id] };
  }
  return presets;
}

const savePresets = debounce((presets) => {
  localStorage[key] = JSON.stringify(presets);
}, 250);

export function noteParams(id: number) {
  return loadPresets()[id] ?? DEFAULT_NOTE;
}
