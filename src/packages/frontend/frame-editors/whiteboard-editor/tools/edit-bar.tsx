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
import { Actions, extendToIncludeEdges } from "../actions";
import { BrushPreview } from "./pen";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { FONT_FACES as FONT_FAMILIES } from "@cocalc/frontend/editors/editor-button-bar";
import { getPageSpan } from "../math";
import { ConfigParams, TOOLS } from "./spec";
import { copyToClipboard } from "./clipboard";
import LockButton, { isLocked } from "./lock-button";
import HideButton, { isHidden } from "./hide-button";
import { ELEMENTS } from "../elements/spec";

import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  minFontSize,
  maxFontSize,
  defaultOpacity,
  defaultRadius,
  maxRadius,
} from "./defaults";

interface Props {
  elements: Element[]; // selected ones
  allElements: Element[]; // all of them
  readOnly?: boolean;
}

export default function EditBar({ elements, allElements, readOnly }: Props) {
  const { actions } = useFrameContext();
  const configParams = useMemo(() => {
    return getCommonConfigParams(elements);
  }, [elements]);

  if (elements.length == 0) return null;
  const props = { actions, elements, allElements, readOnly };
  const hidden = isHidden(elements);
  const locked = isLocked(elements);

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
        {!(readOnly || locked || hidden) && (
          <>
            {configParams.has("color") && <ColorButton {...props} />}
            {configParams.has("fontFamily") && <FontFamily {...props} />}
            {configParams.has("fontSize") && <FontSize {...props} />}
            {configParams.has("opacity") && <Opacity {...props} />}
            {configParams.has("radius") && <Radius {...props} />}
            <GroupButton {...props} />
          </>
        )}
        {!readOnly && !hidden && <LockButton elements={elements} />}
        {!readOnly && !locked && <HideButton elements={elements} />}
        {!(readOnly || locked || hidden) && <DeleteButton {...props} />}
        <OtherOperations {...props} />
      </div>
    </div>
  );
}

export const BUTTON_STYLE = {
  fontSize: "22px",
  color: "#666",
  height: "42px",
  padding: "4px 5px",
};

interface ButtonProps {
  actions: Actions;
  elements: Element[];
}

function DeleteButton({ elements }: ButtonProps) {
  const { actions, id } = useFrameContext();
  return (
    <Tooltip title="Delete">
      <Button
        style={{ ...BUTTON_STYLE, borderLeft: "1px solid #ccc" }}
        type="text"
        onClick={() => {
          actions.deleteElements(elements);
          actions.clearSelection(id);
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
          width: "70px",
          fontSize: "20px",
          color: "#666",
          paddingTop: "4px",
        }}
        min={0}
        max={maxRadius}
        step={0.5}
        defaultValue={getRadius(elements)}
        onChange={(radius) => {
          // If radius is 0 we set radius to null, hence removing it, so will fallback to default value.
          // For code cell the default is "no border", but for a pen it might be something else.
          setDataField(
            { elements, actions },
            { radius: !radius ? null : radius }
          );
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

function Opacity({ actions, elements }: ButtonProps) {
  return (
    <Tooltip title="Opacity: 1 is solid; less than 1 is transparent">
      <InputNumber
        style={{
          width: "70px",
          fontSize: "20px",
          color: "#666",
          paddingTop: "4px",
        }}
        min={0}
        max={1}
        step={0.01}
        defaultValue={getOpacity(elements)}
        onChange={(opacity) => {
          // If radius is 0 we set radius to null, hence removing it, so will fallback to default value.
          // For code cell the default is "no border", but for a pen it might be something else.
          setDataField(
            { elements, actions },
            { opacity: opacity == 1 ? null : opacity }
          );
        }}
      />
    </Tooltip>
  );
}

function getOpacity(elements: Element[]): number | undefined {
  for (const element of elements) {
    if (element.data?.opacity) {
      return element.data?.opacity;
    }
  }
  return defaultOpacity;
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

function OtherOperations({ actions, elements, allElements, readOnly }) {
  const frame = useFrameContext();
  const hidden = isHidden(elements);
  const locked = isLocked(elements);
  const menu = (
    <Menu
      onClick={({ key }) => {
        if (key == "bring-to-front") {
          const { zMax } = getPageSpan(allElements);
          let z = zMax + 1;
          for (const element of elements) {
            actions.setElement({ obj: { ...element, z }, save: false });
            z += 1;
          }
          actions.syncstring_commit();
          actions.clearSelection(frame.id);
          return;
        } else if (key == "send-to-back") {
          const { zMin } = getPageSpan(allElements);
          let z = zMin - 1;
          for (const element of elements) {
            actions.setElement({ obj: { id: element.id, z }, save: false });
            z -= 1;
          }
          actions.syncstring_commit();
          actions.clearSelection(frame.id);
          return;
        } else if (key == "copy") {
          extendToIncludeEdges(elements, allElements);
          copyToClipboard(elements);
        } else if (key == "duplicate") {
          const elements0 = [...elements];
          extendToIncludeEdges(elements, allElements);
          copyToClipboard(elements);
          actions.paste(frame.id, undefined, elements0);
        } else if (key == "cut") {
          extendToIncludeEdges(elements, allElements);
          copyToClipboard(elements);
          actions.deleteElements(elements);
          actions.clearSelection(frame.id);
        } else if (key == "delete") {
          actions.deleteElements(elements);
          actions.clearSelection(frame.id);
        } else if (key == "paste") {
          actions.paste(frame.id);
        } else if (key == "lock") {
          actions.lockElements(elements);
        } else if (key == "unlock") {
          actions.unlockElements(elements);
        } else if (key == "hide") {
          actions.hideElements(elements);
        } else if (key == "unhide") {
          actions.unhideElements(elements);
        }
      }}
    >
      {!readOnly && <Menu.Item key="bring-to-front">Bring to front</Menu.Item>}
      {!readOnly && <Menu.Item key="send-to-back">Send to back</Menu.Item>}
      {!readOnly && <Menu.Item key="cut">Cut</Menu.Item>}
      <Menu.Item key="copy">Copy</Menu.Item>
      {!readOnly && <Menu.Item key="paste">Paste</Menu.Item>}
      {!readOnly && <Menu.Item key="duplicate">Duplicate</Menu.Item>}
      {!readOnly && <Menu.Item key="delete">Delete</Menu.Item>}
      {!readOnly && !hidden && <Menu.Item key="hide">Hide</Menu.Item>}
      {!readOnly && hidden && <Menu.Item key="unhide">Unhide</Menu.Item>}
      {!readOnly && !locked && <Menu.Item key="lock">Lock</Menu.Item>}
      {!readOnly && locked && <Menu.Item key="unlock">Unlock</Menu.Item>}
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
    actions.setElementData({ element, obj, commit: false, cursors: [{}] });
    if (obj["fontSize"] != null && element.data != null) {
      element.data.fontSize = obj["fontSize"];
      const updateSize = ELEMENTS[element.type]?.updateSize;
      if (updateSize != null) {
        updateSize(element);
        actions.setElement({
          obj: { id: element.id, h: element.h, w: element.w },
          commit: false,
        });
      }
    }
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
