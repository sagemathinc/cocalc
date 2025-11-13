/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import humanizeList from "humanize-list";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import { SERVER_SETTINGS_ENV_PREFIX } from "@cocalc/util/consts";
import { ConfigValid, RowType } from "@cocalc/util/db-schema/site-defaults";
import { version } from "@cocalc/util/smc-version";
import { ON_PREM_DEFAULT_QUOTAS, upgrades } from "@cocalc/util/upgrade-spec";
import { JsonEditor } from "../json-editor";
import { RowEntryInner, testIsInvalid } from "./row-entry-inner";
import { IsReadonly } from "./types";

const MAX_UPGRADES = upgrades.max_per_project;

const FIELD_DEFAULTS = {
  default_quotas: ON_PREM_DEFAULT_QUOTAS,
  max_upgrades: MAX_UPGRADES,
} as const;

export interface RowEntryInnerProps {
  name: string;
  value: string; // value is the rawValue (a string)
  valid?: ConfigValid;
  password: boolean;
  multiline?: number;
  isReadonly: IsReadonly | null;
  onChangeEntry: (name: string, value: string) => void;
  clearable?: boolean;
  update: () => void;
}

interface RowEntryProps extends RowEntryInnerProps {
  displayed_val?: string; // the processed rawValue
  hint?: React.JSX.Element;
  rowType?: RowType;
  onJsonEntryChange: (name: string, value?: string) => void;
  onChangeEntry: (name: string, value: string) => void;
}

export function RowEntry({
  name,
  value,
  password,
  displayed_val,
  valid,
  hint,
  rowType,
  multiline,
  isReadonly,
  onJsonEntryChange,
  onChangeEntry,
  clearable,
  update,
}: RowEntryProps) {
  if (isReadonly == null) return null; // typescript

  function ReadOnly({ readonly }) {
    if (readonly) {
      return (
        <>
          Value controlled via{" "}
          <code>
            ${SERVER_SETTINGS_ENV_PREFIX}_{name.toUpperCase()}
          </code>
          .
        </>
      );
    } else {
      return null;
    }
  }

  if (rowType == "header") {
    return <div />;
  } else {
    switch (name) {
      case "default_quotas":
      case "max_upgrades":
        const ro: boolean = isReadonly[name];
        return (
          <>
            <JsonEntry
              name={name}
              data={value}
              readonly={ro}
              onJsonEntryChange={onJsonEntryChange}
            />
            <ReadOnly readonly={ro} />
          </>
        );
      default:
        const is_valid = !testIsInvalid(value, valid);
        return (
          <div>
            <RowEntryInner
              name={name}
              value={value}
              valid={valid}
              password={password}
              multiline={multiline}
              onChangeEntry={onChangeEntry}
              isReadonly={isReadonly}
              clearable={clearable}
              update={update}
            />
            <div style={{ fontSize: "90%", display: "inlineBlock" }}>
              {!Array.isArray(value) &&
              name === "version_recommended_browser" ? (
                <VersionHint value={value} />
              ) : undefined}
              {hint}
              <ReadOnly readonly={isReadonly[name]} />
              {displayed_val != null && (
                <span>
                  {" "}
                  {is_valid ? "Interpreted as" : "Invalid:"}{" "}
                  <code>{displayed_val}</code>.{" "}
                </span>
              )}
              {valid != null && Array.isArray(valid) && (
                <span>Valid values: {humanizeList(valid)}.</span>
              )}
            </div>
          </div>
        );
    }
  }
}

function VersionHint({ value }: { value: string }) {
  let error;
  if (new Date(parseInt(value) * 1000) > new Date()) {
    error = (
      <div
        style={{
          background: "red",
          color: "white",
          margin: "15px",
          padding: "15px",
        }}
      >
        INVALID version - it is in the future!!
      </div>
    );
  } else {
    error = undefined;
  }
  return (
    <div style={{ marginTop: "15px", color: "#666" }}>
      Your browser version:{" "}
      <CopyToClipBoard
        style={{
          display: "inline-block",
          width: "50ex",
          margin: 0,
        }}
        value={`${version}`}
      />{" "}
      {error}
    </div>
  );
}

// This is specific to on-premises kubernetes setups.
// The production site works differently.
// TODO: make this a more sophisticated data editor.
function JsonEntry({ name, data, readonly, onJsonEntryChange }) {
  const jval = JSON.parse(data ?? "{}") ?? {};
  const dflt = FIELD_DEFAULTS[name];
  const quotas = { ...dflt, ...jval };
  const value = JSON.stringify(quotas);
  return (
    <JsonEditor
      value={value}
      readonly={readonly}
      rows={10}
      onSave={(value) => onJsonEntryChange(name, value)}
    />
  );
}
