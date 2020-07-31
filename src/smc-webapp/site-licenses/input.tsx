/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Inputing a site license, e.g., for a project, course, etc.

import { Button } from "antd";
import { Space } from "../r_misc";
import { CSS, React, useState } from "../app-framework";
import { is_valid_uuid_string } from "smc-util/misc";

export const LICENSE_STYLE: CSS = {
  width: "100%",
  margin: "15px 0",
  padding: "10px",
  borderRadius: "5px",
  border: "1px solid grey",
  fontFamily: "monospace",
  fontSize: "14pt",
  color: "darkblue",
} as const;

interface Props {
  onSave: (license_id: string) => void;
  onCancel: () => void;
}

export const SiteLicenseInput: React.FC<Props> = ({ onSave, onCancel }) => {
  const [license_id, set_license_id] = useState<string>("");

  const valid = is_valid_uuid_string(license_id);

  return (
    <div>
      <input
        style={LICENSE_STYLE}
        type="text"
        value={license_id}
        onChange={(e) => set_license_id(e.target.value)}
      />
      <br />
      <Button onClick={onCancel}>Cancel</Button>
      <Space />
      <Button
        disabled={!valid}
        type="primary"
        onClick={() => {
          onSave(license_id);
        }}
      >
        Save
      </Button>
      <Space/>
      {!valid && license_id
        ? "Valid license keys are 36 characters long."
        : undefined}
    </div>
  );
};
