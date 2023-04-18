/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import humanizeList from "humanize-list";

import { FormGroup } from "@cocalc/frontend/antd-bootstrap";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import { SERVER_SETTINGS_ENV_PREFIX } from "@cocalc/util/consts";
import { ConfigValid, RowType } from "@cocalc/util/db-schema/site-defaults";
import { version } from "@cocalc/util/smc-version";
import { ON_PREM_DEFAULT_QUOTAS, upgrades } from "@cocalc/util/upgrade-spec";
import { JsonEditor } from "../json-editor";
import { RowEntryInner } from "./row-entry-inner";
import { IsReadonly } from "./types";

const MAX_UPGRADES = upgrades.max_per_project;

const FIELD_DEFAULTS = {
  default_quotas: ON_PREM_DEFAULT_QUOTAS,
  max_upgrades: MAX_UPGRADES,
} as const;

interface RowEntryProps {
  name: string;
  value: string;
  password: boolean;
  displayed_val?: string;
  valid?: ConfigValid;
  hint?;
  rowType?: RowType;
  multiline?: number;
  isReadonly: IsReadonly | null;
  onJsonEntryChange: (name: string, value?: string) => void;
  onChangeEntry: (name: string, value: string) => void;
  clearable;
  update;
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
            {ro && (
              <>
                Value controlled via{" "}
                <code>
                  ${SERVER_SETTINGS_ENV_PREFIX}_{name.toUpperCase()}
                </code>
                .
              </>
            )}
          </>
        );
      default:
        return (
          <FormGroup>
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
              {name == "version_recommended_browser" && (
                <VersionHint value={value} />
              )}
              {hint}
              <ReadOnly readonly={isReadonly[name]} />
              {displayed_val != null && (
                <span>
                  {" "}
                  Interpreted as <code>{displayed_val}</code>.{" "}
                </span>
              )}
              {valid != null && Array.isArray(valid) && (
                <span>Valid values: {humanizeList(valid)}.</span>
              )}
            </div>
          </FormGroup>
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
