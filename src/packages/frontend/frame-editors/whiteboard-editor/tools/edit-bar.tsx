/*
Editing bar for editing one (or more) selected elements.
*/

import { Button, Dropdown, InputNumber, Select, Tooltip } from "antd";
import { CSSProperties, ReactNode, useMemo, useState } from "react";
const { Option } = Select;

import { CSS } from "@cocalc/frontend/app-framework";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { Icon } from "@cocalc/frontend/components/icon";
import { FONT_FACES as FONT_FAMILIES } from "@cocalc/frontend/editors/editor-button-bar";
import { MenuItems } from "../../../components";
import { Actions, extendToIncludeEdges } from "../actions";
import { ELEMENTS } from "../elements/desc";
import { useFrameContext } from "../hooks";
import { getPageSpan } from "../math";
import { Element } from "../types";
import { copyToClipboard } from "./clipboard";
import {
  defaultOpacity,
  defaultRadius,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  maxFontSize,
  maxRadius,
  minFontSize,
} from "./defaults";
import { ConfigParams, TOOLS } from "./desc";
import HideButton, { isHidden } from "./hide-button";
import LockButton, { isLocked } from "./lock-button";
import { PANEL_STYLE } from "./panel";
import { BrushPreview } from "./pen";

interface Props {
  elements: Element[]; // selected ones
  allElements: Element[]; // all of them
  readOnly?: boolean;
}

export default function EditBar(opts: Props) {
  const { elements, allElements, readOnly } = opts;
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
        top: "15px",
        display: "flex",
        flexDirection: "column",
        height: "42px",
        ...(elements.length == 1 &&
        elements[0].type ==
          "code" /* this is basically a hack for now so tab completion in code cells doesn't get obscured by edit bar */
          ? { right: "10px" }
          : undefined),
      }}
    >
      <Button.Group>
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
        {
          !(readOnly || hidden) && !locked && (
            <DuplicateButton {...props} />
          ) /* don't show when locked just to make lock state much clearer - there is duplicate in menu, and it isn't that likely that you need to use this on something locked */
        }
        {!readOnly && !hidden && <LockButton elements={elements} />}
        {!readOnly && !locked && <HideButton elements={elements} />}
        {!(readOnly || locked || hidden) && <DeleteButton {...props} />}
        <OtherOperations {...props} />
      </Button.Group>
    </div>
  );
}

export const BUTTON_STYLE: CSS = {
  fontSize: "22px",
  color: "#666",
  height: "42px",
  padding: "4px 5px",
} as const;

interface ButtonProps {
  actions: Actions;
  elements: Element[];
}

function DeleteButton({ elements }: ButtonProps) {
  const { actions, id } = useFrameContext();
  return (
    <Tooltip title="Delete selected">
      <Button
        style={{ ...BUTTON_STYLE }}
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

function DuplicateButton({ elements }: ButtonProps) {
  const { actions, id } = useFrameContext();
  return (
    <Tooltip title="Duplicate selected">
      <Button
        style={{ ...BUTTON_STYLE, borderLeft: "1px solid #ccc" }}
        onClick={() => {
          actions.duplicateElements(elements, id);
        }}
      >
        <Icon name="clone" />
      </Button>
    </Tooltip>
  );
}

function ColorButton(props: ButtonProps) {
  const { actions, elements } = props;
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [color, setColor0] = useState<string | undefined>(getColor(elements));

  function setColor(color: string) {
    setColor0(color);
    setDataField({ elements, actions }, { color });
  }

  return (
    <>
      <Tooltip title="Color">
        <Button style={BUTTON_STYLE} onClick={() => setShowPicker(!showPicker)}>
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

function GroupButton(props: ButtonProps) {
  const { actions, elements } = props;
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

function FontSize(props: ButtonProps) {
  const { actions, elements } = props;
  return (
    <Tooltip title="Font size (pixels)">
      <InputNumber
        style={{
          width: "64px",
          fontSize: "20px",
          color: "#666",
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

function Radius(props: ButtonProps) {
  const { actions, elements } = props;
  return (
    <Tooltip title="Radius (pixels)">
      <InputNumber
        style={{
          width: "70px",
          fontSize: "20px",
          color: "#666",
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

function Opacity(props: ButtonProps) {
  const { actions, elements } = props;
  return (
    <Tooltip title="Opacity: 1 is solid; less than 1 is transparent">
      <InputNumber
        style={{
          width: "70px",
          fontSize: "20px",
          color: "#666",
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

function FontFamily(props: ButtonProps) {
  const { actions, elements } = props;
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

interface SFFOpts {
  onChange?: (fontFamily: string) => void;
  defaultValue?: string;
  value?: string;
  size?: any;
  style?: CSSProperties;
}

export function SelectFontFamily(opts: SFFOpts) {
  const { onChange, value, defaultValue, size, style } = opts;
  const v: ReactNode[] = [];
  for (const fontFamily of FONT_FAMILIES) {
    v.push(
      <Option
        value={fontFamily}
        key={fontFamily}
        search={fontFamily.toLowerCase()}
      >
        <span
          style={{
            fontFamily: fontFamily != "Sans" ? fontFamily : "sans-serif",
          }}
        >
          {fontFamily}
        </span>
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
        optionLabelProp="label"
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

function OtherOperations(opts) {
  const { actions, elements, allElements, readOnly } = opts;
  const frame = useFrameContext();
  const hidden = isHidden(elements);
  const locked = isLocked(elements);

  const menuItems: MenuItems = [];

  if (!readOnly && !locked) {
    menuItems.push({
      key: "bring-to-front",
      icon: <Icon name={"arrow-circle-up"} />,
      label: "Bring to front",
      onClick: () => {
        const { zMax } = getPageSpan(allElements);
        let z = zMax + 1;
        for (const element of elements) {
          actions.setElement({ obj: { ...element, z }, save: false });
          z += 1;
        }
        actions.syncstring_commit();
        actions.clearSelection(frame.id);
      },
    });
    menuItems.push({
      key: "send-to-back",
      icon: <Icon name={"arrow-circle-down"} />,
      label: "Send to back",
      onClick: () => {
        const { zMin } = getPageSpan(allElements);
        let z = zMin - 1;
        for (const element of elements) {
          actions.setElement({ obj: { id: element.id, z }, save: false });
          z -= 1;
        }
        actions.syncstring_commit();
        actions.clearSelection(frame.id);
      },
    });
    menuItems.push({
      key: "cut",
      icon: <Icon name="cut" />,
      label: "Cut",
      onClick: () => {
        extendToIncludeEdges(elements, allElements);
        copyToClipboard(elements);
        actions.deleteElements(elements);
        actions.clearSelection(frame.id);
      },
    });
  }

  menuItems.push({
    key: "copy",
    icon: <Icon name="copy" />,
    label: "Copy",
    onClick: () => {
      extendToIncludeEdges(elements, allElements);
      copyToClipboard(elements);
    },
  });

  // if (!readOnly) {
  //   menuItems.push({
  //     key: "paste",
  //     icon: <Icon name="paste" />,
  //     label: "Paste",
  //     onClick: () => {
  //       actions.paste(frame.id);
  //   });
  // })

  if (!readOnly) {
    menuItems.push({
      key: "duplicate",
      icon: <Icon name="clone" />,
      label: "Duplicate",
      onClick: () => {
        actions.duplicateElements(elements, frame.id);
      },
    });
  }

  if (!readOnly && !locked) {
    menuItems.push({
      key: "delete",
      icon: <Icon name="trash" />,
      label: "Delete",
      onClick: () => {
        actions.deleteElements(elements);
        actions.clearSelection(frame.id);
      },
    });
  }

  if (!readOnly && !hidden && !locked) {
    menuItems.push({
      key: "hide",
      icon: <Icon name={"eye-slash"} />,
      label: "Hide",
      onClick: () => {
        actions.hideElements(elements);
      },
    });
  }

  if (!readOnly && hidden && !locked) {
    menuItems.push({
      key: "unhide",
      icon: <Icon name={"eye"} />,
      label: "Unhide",
      onClick: () => {
        actions.unhideElements(elements);
      },
    });
  }

  if (!readOnly && !locked) {
    menuItems.push({
      key: "lock",
      icon: <Icon name={"lock"} />,
      label: "Lock",
      onClick: () => {
        actions.lockElements(elements);
      },
    });
  }

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
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

interface DFProps {
  elements: Element[];
  actions: Actions;
}

function setDataField(props: DFProps, obj: object) {
  const { elements, actions } = props;
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
