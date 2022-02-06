/*
Editing bar for editing one (or more) selected elements.
*/

import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { Button, InputNumber, Menu, Dropdown, Select, Tooltip } from "antd";
const { Option } = Select;
import { Element } from "../types";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "../hooks";
import { Actions } from "../actions";
import { BrushPreview } from "./pen";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { FONT_FACES as FONT_FAMILIES } from "@cocalc/frontend/editors/editor-button-bar";
import { getPageSpan } from "../math";
import { ConfigParams, TOOLS } from "./spec";

import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  minFontSize,
  maxFontSize,
  defaultRadius,
  minRadius,
  maxRadius,
} from "./defaults";

interface Props {
  elements: Element[]; // selected ones
  allElements: Element[]; // all of them
}

export default function EditBar({ elements, allElements }: Props) {
  const { actions } = useFrameContext();
  if (elements.length == 0) return null;
  const props = { actions, elements, allElements };
  const configParams = useMemo(() => {
    return getCommonConfigParams(elements);
  }, [elements]);
  return (
    <div
      style={{
        ...PANEL_STYLE,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        height: "42px",
      }}
    >
      <div style={{ display: "flex" }}>
        {configParams.has("fontFamily") && <FontFamily {...props} />}
        {configParams.has("fontSize") && <FontSize {...props} />}
        {configParams.has("radius") && <Radius {...props} />}
        {configParams.has("color") && <ColorButton {...props} />}
        <GroupButton {...props} />
        <DeleteButton {...props} />
        <OtherOperations {...props} />
      </div>
    </div>
  );
}

const BUTTON_STYLE = {
  fontSize: "22px",
  color: "#666",
  height: "42px",
  padding: "4px 5px",
};

interface ButtonProps {
  actions: Actions;
  elements: Element[];
}

function DeleteButton({ actions, elements }: ButtonProps) {
  return (
    <Tooltip title="Delete">
      <Button
        style={{ ...BUTTON_STYLE, borderLeft: "1px solid #ccc" }}
        type="text"
        onClick={() => {
          for (const { id } of elements) {
            actions.delete(id);
          }
          actions.syncstring_commit();
        }}
      >
        <Icon name="trash" />
      </Button>
    </Tooltip>
  );
}

function ColorButton({ actions, elements }: ButtonProps) {
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [color, setColor0] = useState<string | undefined>(getColor(elements));

  function setColor(color: string) {
    setColor0(color);
    setDataField({ elements, actions }, { color });
  }

  return (
    <>
      <Tooltip title="Color">
        <Button
          style={BUTTON_STYLE}
          type="text"
          onClick={() => setShowPicker(!showPicker)}
        >
          <BrushPreview radius={maxRadius} color={color ?? "black"} />
        </Button>
      </Tooltip>
      {showPicker && (
        <ColorPicker
          color={color}
          onChange={setColor}
          style={{
            background: "white",
            padding: "10px",
            border: "1px solid grey",
            boxShadow: "0 0 5px grey",
            borderRadius: "3px",
            position: "absolute",
            top: "50px" /* TODO: may want more intelligent positioning */,
          }}
        />
      )}
    </>
  );
}

function GroupButton({ actions, elements }: ButtonProps) {
  if (elements.length <= 1) return null;
  let grouped = false;
  for (const element of elements) {
    if (element.group) {
      grouped = true;
      break;
    }
  }
  return (
    <Tooltip
      title={`${grouped ? "Ungroup" : "Group"} ${elements.length} objects`}
    >
      <Button
        style={{ ...BUTTON_STYLE, borderLeft: "1px solid #ccc" }}
        type="text"
        onClick={() => {
          const ids = elements.map((element) => element.id);
          if (grouped) {
            actions.ungroupElements(ids);
          } else {
            actions.groupElements(ids);
          }
        }}
      >
        <Icon name={grouped ? "ungroup" : "group"} />
      </Button>
    </Tooltip>
  );
}

function getColor(elements: Element[]): string | undefined {
  for (const element of elements) {
    if (element.data?.color) {
      return element.data?.color;
    }
  }
}

function FontSize({ actions, elements }: ButtonProps) {
  return (
    <Tooltip title="Font size (pixels)">
      <InputNumber
        style={{
          width: "64px",
          fontSize: "20px",
          color: "#666",
          paddingTop: "4px",
        }}
        min={minFontSize}
        max={maxFontSize}
        defaultValue={getFontSize(elements)}
        onChange={(fontSize) => {
          setDataField({ elements, actions }, { fontSize });
        }}
      />
    </Tooltip>
  );
}

function getFontSize(elements: Element[]): number | undefined {
  for (const element of elements) {
    if (element.data?.fontSize) {
      return element.data?.fontSize;
    }
  }
  return DEFAULT_FONT_SIZE;
}

function Radius({ actions, elements }: ButtonProps) {
  return (
    <Tooltip title="Radius (pixels)">
      <InputNumber
        style={{
          width: "64px",
          fontSize: "20px",
          color: "#666",
          paddingTop: "4px",
        }}
        min={minRadius}
        max={maxRadius}
        defaultValue={getRadius(elements)}
        onChange={(radius) => {
          setDataField({ elements, actions }, { radius });
        }}
      />
    </Tooltip>
  );
}

function getRadius(elements: Element[]): number | undefined {
  for (const element of elements) {
    if (element.data?.radius) {
      return element.data?.radius;
    }
  }
  return defaultRadius;
}

function FontFamily({ actions, elements }: ButtonProps) {
  return (
    <SelectFontFamily
      onChange={(fontFamily) => {
        setDataField({ elements, actions }, { fontFamily });
      }}
      defaultValue={getFontFamily(elements)}
      size="large"
      style={{ marginTop: "1px", minWidth: "100px" }}
    />
  );
}

export function SelectFontFamily({
  onChange,
  value,
  defaultValue,
  size,
  style,
}: {
  onChange?: (fontFamily: string) => void;
  defaultValue?: string;
  value?: string;
  size?: any;
  style?: CSSProperties;
}) {
  const v: ReactNode[] = [];
  for (const fontFamily of FONT_FAMILIES) {
    v.push(
      <Option
        value={fontFamily}
        key={fontFamily}
        search={fontFamily.toLowerCase()}
      >
        <span style={{ fontFamily }}>{fontFamily}</span>
      </Option>
    );
  }

  return (
    <Tooltip title="Select a font">
      <Select
        style={style}
        size={size}
        value={value}
        defaultValue={defaultValue}
        showSearch
        placeholder="Select a font"
        optionFilterProp="children"
        onChange={onChange}
        filterOption={(input, option) => {
          if (!input.trim()) return true;
          return option?.search.includes(input.toLowerCase());
        }}
      >
        {v}
      </Select>
    </Tooltip>
  );
}

function getFontFamily(elements: Element[]): string | undefined {
  for (const element of elements) {
    if (element.data?.fontFamily) {
      return element.data?.fontFamily;
    }
  }
  return DEFAULT_FONT_FAMILY;
}

function OtherOperations({ actions, elements, allElements }) {
  const frame = useFrameContext();
  const menu = (
    <Menu
      onClick={({ key }) => {
        if (key == "bring-to-front") {
          const { zMax } = getPageSpan(allElements);
          let z = zMax + 1;
          for (const element of elements) {
            actions.setElement({ ...element, z }, false);
            z += 1;
          }
          actions.syncstring_commit();
          actions.clearSelection(frame.id);
        } else if (key == "send-to-back") {
          const { zMin } = getPageSpan(allElements);
          let z = zMin - 1;
          for (const element of elements) {
            actions.setElement({ ...element, z }, false);
            z -= 1;
          }
          actions.syncstring_commit();
          actions.clearSelection(frame.id);
          return;
        }
      }}
    >
      <Menu.Item key="bring-to-front">Bring to front</Menu.Item>
      <Menu.Item key="send-to-back">Send to back</Menu.Item>
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={["click"]}>
      <Icon
        name="ellipsis"
        style={{
          padding: "12px 10px 0",
          borderLeft: "1px solid #ccc",
          cursor: "pointer",
        }}
      />
    </Dropdown>
  );
}

function setDataField(
  {
    elements,
    actions,
  }: {
    elements: Element[];
    actions: Actions;
  },
  obj: object
) {
  for (const element of elements) {
    actions.setElement(
      { ...element, data: { ...element.data, ...obj } },
      false
    );
  }
  actions.syncstring_commit();
}

// Determine which of the config params are applicable
// to the selected elements.

function getCommonConfigParams(elements: Element[]): Set<ConfigParams> {
  let params = TOOLS[elements?.[0]?.type]?.config ?? new Set([]);
  if (elements.length <= 1) {
    return params;
  }
  // intersect it down
  for (const { type } of elements.slice(1)) {
    const { config } = TOOLS[type] ?? {};
    if (config == null) {
      return new Set([]);
    }
    params = new Set([...params].filter((x) => config.has(x)));
    if (params.size == 0) return params;
  }
  return params;
}
