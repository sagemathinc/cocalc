/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as copy_to_clipboard from "copy-to-clipboard";
import { CSS, React, ReactDOM, useRef, useState } from "../app-framework";
import {
  Button,
  FormControl,
  FormGroup,
  InputGroup,
  Overlay,
  Tooltip,
} from "react-bootstrap";
import { Icon } from "./icon";

/* Takes a value and makes it highlight on click.
   Has a copy to clipboard button by default on the end.
*/

interface Props {
  value: string;
  button_before?: JSX.Element; // Button to place before the copy text
  hide_after?: boolean; // Hide the default after button
  style?: CSS;
}

export const CopyToClipBoard: React.FC<Props> = ({
  value,
  button_before,
  hide_after,
  style,
}) => {
  const [show_tooltip, set_show_tooltip] = useState<boolean>(false);
  const clipboard_button_ref = useRef(null);

  function on_button_click(_e): void {
    set_show_tooltip(true);
    setTimeout(close_tool_tip, 2000);
    copy_to_clipboard(value);
  }

  function close_tool_tip() {
    if (!show_tooltip) {
      return;
    }
    set_show_tooltip(false);
  }

  function render_button_after() {
    return (
      <InputGroup.Button>
        <Overlay
          show={show_tooltip}
          target={() => ReactDOM.findDOMNode(clipboard_button_ref.current)}
          placement="bottom"
        >
          <Tooltip id="copied">Copied!</Tooltip>
        </Overlay>
        <Button ref={clipboard_button_ref} onClick={on_button_click}>
          <Icon name="clipboard" />
        </Button>
      </InputGroup.Button>
    );
  }

  return (
    <FormGroup style={style}>
      <InputGroup>
        {button_before != null ? (
          <InputGroup.Button>{button_before}</InputGroup.Button>
        ) : undefined}
        <FormControl
          type="text"
          readOnly={true}
          style={{ cursor: "default" }}
          onClick={(e) => (e.target as any).select?.()}
          value={value}
        />
        {!hide_after ? render_button_after() : undefined}
      </InputGroup>
    </FormGroup>
  );
};
