/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Inputing a site license, e.g., for a project, course, etc.

import { Button, Select } from "antd";
const { Option } = Select;
import { Space } from "../r_misc";
import {
  React,
  redux,
  useMemo,
  useState,
  useTypedRedux,
  useEffect,
  useRef,
} from "../app-framework";
import { is_valid_uuid_string } from "smc-util/misc";

interface Props {
  onSave: (license_id: string) => void;
  onCancel: () => void;
  exclude?: string[];
}

export const SiteLicenseInput: React.FC<Props> = ({
  onSave,
  onCancel,
  exclude,
}) => {
  const [license_id, set_license_id] = useState<string>("");
  const managed_licenses = useTypedRedux("billing", "managed_licenses");
  const managed_license_ids = useTypedRedux("billing", "managed_license_ids");
  const is_blurred_ref = useRef<boolean>(true);

  useEffect(() => {
    redux.getActions("billing").update_managed_licenses();
  }, []);

  const options: JSX.Element[] = useMemo(() => {
    const v: JSX.Element[] = [];
    if (managed_licenses == null || managed_license_ids == null) {
      return v;
    }
    for (const id of managed_license_ids.toJS()) {
      if (exclude != null && exclude.indexOf(id) >= 0) continue;
      const title = managed_licenses.getIn([id, "title"]);
      // TODO: exclude or mark expired licenses somehow...
      v.push(
        <Option key={id} value={id}>
          <span style={{ fontFamily: "monospace" }}>
            {id} {title != null ? " - " + title : ""}
          </span>
        </Option>
      );
    }
    return v;
  }, [managed_licenses, managed_license_ids]);

  const valid = is_valid_uuid_string(license_id);

  return (
    <div>
      <Select
        style={{ width: "100%", maxWidth: "70ex", margin: "5px 0" }}
        placeholder={
          "Enter license code " +
          (options.length > 0 ? "or select from the licenses you manage" : "")
        }
        value={license_id ? license_id : undefined}
        onBlur={() => {
          is_blurred_ref.current = true;
        }}
        onFocus={() => {
          is_blurred_ref.current = false;
        }}
        onChange={(value) => {
          set_license_id(value);
        }}
        onSearch={(value) => {
          if (is_blurred_ref.current) return; // hack since blur when text is not in list clears things.
          set_license_id(value);
        }}
        showSearch
        notFoundContent={null}
      >
        {options}
      </Select>
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
      <Space />
      {!valid && license_id
        ? "Valid license keys are 36 characters long."
        : undefined}
    </div>
  );
};
