/*
Editing bar for editing one (or more) selected elements.
*/

import { CSSProperties, ReactNode, useState } from "react";
import { Button, InputNumber, Select, Tooltip } from "antd";
const { Option } = Select;
import { Element } from "../types";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "../actions";
import { BrushPreview, maxRadius } from "./pen";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { FONT_FACES as FONT_FAMILIES } from "@cocalc/frontend/editors/editor-button-bar";

import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  minFontSize,
  maxFontSize,
} from "./defaults";

interface Props {
  elements: Element[];
}

export default function EditBar({ elements }: Props) {
  const frame = useFrameContext();
  const actions = frame.actions as Actions;
  if (elements.length == 0) return null;
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
        <FontFamily actions={actions} elements={elements} />
        <FontSize actions={actions} elements={elements} />
        <ColorButton actions={actions} elements={elements} />
        <DeleteButton actions={actions} elements={elements} />
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

function getColor(elements: Element[]): string | undefined {
  for (const element of elements) {
    if (element.data?.color) {
      return element.data?.color;
    }
  }
}

function FontSize({ actions, elements }: ButtonProps) {
  return (
    <Tooltip title="Font size in pixels">
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
  defaultValue,
  size,
  style,
}: {
  onChange?: (fontFamily: string) => void;
  defaultValue?: string;
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
