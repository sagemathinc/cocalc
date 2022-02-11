/*
The time config panel.

Time configuration:

- fontSize, fontFamily
- color
- countdown timer or stopwatch

TODO: should be possible to edit countdown timer amount of time.
*/

import { ReactNode, useState } from "react";
import { Button, Popover, Slider } from "antd";
import { PANEL_STYLE } from "./panel";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { useFrameContext } from "../hooks";
import { debounce } from "lodash";
import { DEFAULT_FONT_SIZE, minFontSize, maxFontSize } from "./defaults";
import { ResetButton } from "./common";
import { SelectFontFamily } from "./edit-bar";
import { TimeAmount } from "@cocalc/frontend/editors/stopwatch/stopwatch";
import { Icon } from "@cocalc/frontend/components";

interface TimerConfig {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  countdown?: number;
}

const COLORS = ["#252937", "#db482d", "#002bdb", "#2b6855"];

const numTimers = 2 * COLORS.length;

export const DEFAULT: TimerConfig = {};

export default function TimerToolPanel() {
  const frame = useFrameContext();
  const [selected, setSelected] = useState<number>(
    frame.desc.get("timeId") ?? 0
  );
  const [paramControls, setParamControls] = useState<boolean>(false);
  const [presets, setPresets0] = useState<Presets>(loadPresets());

  function setPresets(presets) {
    setPresets0(presets);
    savePresets(presets);
  }

  function TimerButton({ id }) {
    const { fontSize, fontFamily, color, countdown } = presets[id] ?? DEFAULT;
    return (
      <Button
        style={{ padding: "5px", height: "35px" }}
        type="text"
        onClick={() => {
          if (id == selected) {
            setParamControls(!paramControls);
          } else {
            // select this one
            setSelected(id);
            frame.actions.set_frame_tree({ id: frame.id, timerId: id });
          }
        }}
      >
        <TimerToolButton
          fontSize={fontSize}
          fontFamily={fontFamily}
          countdown={countdown}
          color={color}
          borderColor={id == selected ? "blue" : "#ccc"}
        />
      </Button>
    );
  }

  const timerPresets: ReactNode[] = [];
  for (let id = 0; id < numTimers; id++) {
    timerPresets.push(<TimerButton key={id} id={id} />);
  }

  const { fontSize, color, fontFamily, countdown } =
    presets[selected] ?? DEFAULT;

  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "110px",
      }}
    >
      <div style={{ maxHeight: "50vh", overflowY: "scroll" }}>
        {timerPresets}
      </div>
      <ResetButton
        onClick={() => {
          setPresets(defaultPresets());
        }}
      />
      {paramControls && (
        <TimerParams
          color={color}
          fontSize={fontSize}
          fontFamily={fontFamily}
          countdown={countdown}
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

function TimerIcon({ countdown }) {
  return <Icon name={countdown ? "hourglass-half" : "stopwatch"} />;
}

function TimerToolButton({
  fontFamily,
  fontSize,
  color,
  countdown,
  borderColor,
}: {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  countdown?: number;
  borderColor: string;
}) {
  return (
    <Popover
      placement="right"
      title={
        <div style={{ textAlign: "center" }}>
          {countdown != null ? "Countdown Timer" : "Stopwatch"}
        </div>
      }
      content={
        <TimerPreview
          fontFamily={fontFamily}
          countdown={countdown}
          fontSize={fontSize}
          color={color}
        />
      }
    >
      <div
        style={{
          color,
          fontFamily,
          border: `1px solid ${borderColor ?? "#ccc"}`,
          width: "97px",
          height: "25px",
        }}
      >
        <TimerPreview
          fontFamily={fontFamily}
          color={color}
          countdown={countdown}
        />
      </div>
    </Popover>
  );
}

function TimerPreview({
  fontFamily,
  fontSize,
  color,
  countdown,
}: {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  countdown?: number;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: fontSize ? `${fontSize}px` : undefined,
        fontFamily,
        color,
      }}
    >
      <TimerIcon countdown={countdown} />{" "}
      {countdown == null ? (
        "00:00:00"
      ) : (
        <TimeAmount amount={countdown * 1000} compact />
      )}
    </div>
  );
}

function TimerParams({
  color,
  fontSize,
  fontFamily,
  countdown,
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
      <TimerPreview
        fontFamily={fontFamily}
        fontSize={fontSize}
        color={color}
        countdown={countdown}
      />
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
      <ColorPicker color={color} onChange={setColor} />
    </div>
  );
}

// For now just storing these presets in localStorage.
// TODO: move to account settings or the document.  NOT SURE?!
type Presets = {
  [id: string]: TimerConfig;
};

const key = "whiteboard-timer-presets";

function defaultPresets() {
  const presets: Presets = {};
  let id = 0;
  for (const countdown of [null, 60]) {
    for (const color of COLORS) {
      presets[id] = {
        color,
        ...(countdown ? { countdown } : undefined),
      };
      id += 1;
    }
  }
  return presets;
}

function loadPresets() {
  try {
    const presets = JSON.parse(localStorage[key]);
    for (let id = 0; id < numTimers; id++) {
      if (presets[id] == null) {
        presets[id] = {};
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

export function timerParams(id: number) {
  return loadPresets()[id] ?? DEFAULT;
}
