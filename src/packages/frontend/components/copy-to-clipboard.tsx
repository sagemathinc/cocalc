/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import copyToClipboard from "copy-to-clipboard";
import { CSS, React, useRef, useState } from "../app-framework";
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
  buttonBefore?: JSX.Element; // Button to place before the copy text
  hideAfter?: boolean; // Hide the default after button
  style?: CSS;
}

export const CopyToClipBoard: React.FC<Props> = ({
  value,
  buttonBefore,
  hideAfter,
  style,
}) => {
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const clipboardButtonRef = useRef(null);

  return (
    <FormGroup style={style}>
      <InputGroup>
        {buttonBefore != null && (
          <InputGroup.Button>{buttonBefore}</InputGroup.Button>
        )}
        <FormControl
          type="text"
          readOnly={true}
          style={{ cursor: "default" }}
          onClick={(e) => (e.target as any).select?.()}
          value={value}
        />
        {!hideAfter && (
          <InputGroup.Button>
            {showTooltip && clipboardButtonRef.current && (
              <Overlay
                show
                target={clipboardButtonRef.current}
                placement="bottom"
              >
                <Tooltip id="copied">Copied!</Tooltip>
              </Overlay>
            )}
            <Button
              ref={clipboardButtonRef}
              onClick={() => {
                setShowTooltip(true);
                setTimeout(() => setShowTooltip(false), 2000);
                copyToClipboard(value);
              }}
            >
              <Icon name="clipboard" />
            </Button>
          </InputGroup.Button>
        )}
      </InputGroup>
    </FormGroup>
  );
};
