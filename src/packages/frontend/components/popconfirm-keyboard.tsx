/*
This is antd's popconfirm, except it works with the keyboard as well, i.e.,
you can hit enter for yes and escape to cancel.

NOTE: GPT-4/Phind.com wrote the first draft of this and it uses some
trickiery that I didn't think would be possible:
   https://www.phind.com/search?cache=d621f94c-5428-4a34-961c-d8a75c987a3c
*/

import { useEffect, useState } from "react";
import { Popconfirm } from "antd";

import { copy_without } from "@cocalc/util/misc";

export default function PopconfirmKeyboard(props) {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    props.onVisibilityChange?.(visible);
  }, [visible]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      props.onConfirm?.();
      setVisible(false);
    } else if (e.key === "Escape") {
      props.onCancel?.();
      setVisible(false);
    }
  };

  return (
    <Popconfirm
      {...(copy_without(props, [
        "children",
        "visible",
        "onConfirm",
        "onCancel",
      ]) as any)}
      open={visible}
      onConfirm={() => {
        props.onConfirm?.();
        setVisible(false);
      }}
      onCancel={() => {
        props.onCancel?.();
        setVisible(false);
      }}
    >
      <a
        href="#"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          setVisible(!visible);
        }}
      >
        {props.children}
      </a>
    </Popconfirm>
  );
}
