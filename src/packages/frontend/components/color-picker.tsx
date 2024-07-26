/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { Button, Modal, Radio, Select } from "antd";
import { CSSProperties, ReactNode, useState } from "react";
import {
  BlockPicker,
  ChromePicker,
  CirclePicker,
  CompactPicker,
  GithubPicker,
  PhotoshopPicker,
  SketchPicker,
  SliderPicker,
  SwatchesPicker,
  TwitterPicker,
} from "react-color";

const { Option } = Select;

// must be imported from misc/local-storage, because otherwise the "static" build fails
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Icon } from "./icon";

const Pickers = {
  circle: CirclePicker,
  photoshop: PhotoshopPicker,
  chrome: ChromePicker,
  github: GithubPicker,
  twitter: TwitterPicker,
  swatches: SwatchesPicker,
  sketch: SketchPicker,
  block: BlockPicker,
  slider: SliderPicker,
  compact: CompactPicker,
};

type TPickers = keyof typeof Pickers;

const LS_PICKER_KEY = "defaultColorPicker";

function getLocalStoragePicker(): TPickers | undefined {
  const p = get_local_storage(LS_PICKER_KEY);
  if (typeof p === "string" && Pickers[p] != null) {
    return p as TPickers;
  }
}

interface Props {
  color?: string;
  onChange?: (htmlColor: string) => void;
  style?: CSSProperties;
  defaultPicker?: keyof typeof Pickers;
  toggle?: ReactNode;
  justifyContent?: "flex-start" | "flex-end" | "center";
  radio?: boolean;
}
export default function ColorPicker({
  color,
  onChange,
  style,
  defaultPicker,
  toggle,
  justifyContent = "center",
  radio,
}: Props) {
  const [visible, setVisible] = useState<boolean>(!toggle);
  const [picker, setPicker] = useState<TPickers>(
    defaultPicker ?? getLocalStoragePicker() ?? "circle",
  );
  const Picker = Pickers[picker];
  const v: ReactNode[] = [];
  for (const picker in Pickers) {
    v.push(
      <Option key={picker} value={picker}>
        {capitalize(picker)}
      </Option>,
    );
  }
  if (!visible && toggle) {
    return (
      <div onClick={() => setVisible(true)} style={{ cursor: "pointer" }}>
        {toggle}
      </div>
    );
  }
  return (
    <div style={style}>
      {toggle && (
        <div
          style={{ float: "right", cursor: "pointer" }}
          onClick={() => setVisible(false)}
        >
          <Icon name={"times"} />
        </div>
      )}
      <div
        style={{
          display:
            picker != "slider"
              ? "flex"
              : undefined /* https://github.com/sagemathinc/cocalc/issues/5912 */,
          justifyContent,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        <Picker
          color={color}
          onChange={
            onChange != null ? (color) => onChange(color.hex) : undefined
          }
        />
      </div>
      <div>
        {radio ? (
          <div style={{ textAlign: "center", marginTop:'15px' }}>
            <Radio.Group
              size="small"
              optionType="button"
              value={picker}
              buttonStyle="solid"
              options={Object.keys(Pickers).slice(0, 5)}
              onChange={(e) => {
                setPicker(e.target.value);
                set_local_storage(LS_PICKER_KEY, e.target.value);
              }}
            />
            <br />
            <Radio.Group
              size="small"
              optionType="button"
              value={picker}
              buttonStyle="solid"
              options={Object.keys(Pickers).slice(5)}
              onChange={(e) => {
                setPicker(e.target.value);
                set_local_storage(LS_PICKER_KEY, e.target.value);
              }}
            />
          </div>
        ) : (
          <div>
            <div
              style={{
                float: "right",
                fontSize: "12px",
                marginTop: "20px",
                color: COLORS.GRAY_M,
              }}
            >
              Color Picker
            </div>
            <Select
              value={picker}
              style={{ width: "120px", marginTop: "10px" }}
              onChange={(picker) => {
                setPicker(picker);
                set_local_storage(LS_PICKER_KEY, picker);
              }}
            >
              {v}
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

function ColorModal({
  show,
  setShow,
  onChange,
  title,
  radio,
}: {
  show?;
  setShow;
  onChange?;
  title?;
  radio?;
}) {
  return (
    <Modal
      transitionName=""
      maskTransitionName=""
      title={title ?? "Select a Color"}
      open={show}
      onOk={() => setShow(false)}
      onCancel={() => setShow(false)}
    >
      <ColorPicker
        radio={radio}
        onChange={(color) => {
          onChange(color);
          setShow(false);
        }}
      />
    </Modal>
  );
}

interface ButtonProps {
  onChange: (htmlColor: string) => void;
  title?: ReactNode;
  style?: CSSProperties;
  type?: "default" | "link" | "text" | "primary" | "dashed";
  onClick?: () => boolean | undefined;
  radio?: boolean;
}

export function ColorButton({
  onChange,
  title,
  style,
  type,
  onClick,
  radio,
}: ButtonProps) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <>
      <ColorModal
        show={show}
        setShow={setShow}
        title={title}
        onChange={onChange}
        radio={radio}
      />
      <Button
        onClick={() => {
          if (onClick?.()) return;
          setShow(!show);
        }}
        style={style}
        type={type}
      >
        <Icon name="colors" />
      </Button>
    </>
  );
}
