/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties, useMemo, useRef, useState } from "react";
import { Input, InputRef, Popover } from "antd";
import humanizeList from "humanize-list";
import { isEqual } from "lodash";
import { delay } from "awaiting";
import { alert_message } from "@cocalc/frontend/alerts";
import { Button, FormGroup, Well } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import {
  CopyToClipBoard,
  ErrorDisplay,
  Icon,
  LabeledRow,
  Markdown,
  Space,
  Title,
} from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { SERVER_SETTINGS_ENV_PREFIX } from "@cocalc/util/consts";
import {
  Config,
  ConfigValid,
  RowType,
} from "@cocalc/util/db-schema/site-defaults";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { copy, deep_copy, keys, unreachable } from "@cocalc/util/misc";
import { site_settings_conf } from "@cocalc/util/schema";
import { version } from "@cocalc/util/smc-version";
import { COLORS } from "@cocalc/util/theme";
import { ON_PREM_DEFAULT_QUOTAS, upgrades } from "@cocalc/util/upgrade-spec";
import { JsonEditor } from "./json-editor";

const MAX_UPGRADES = upgrades.max_per_project;

const FIELD_DEFAULTS = {
  default_quotas: ON_PREM_DEFAULT_QUOTAS,
  max_upgrades: MAX_UPGRADES,
} as const;

type State = "view" | "load" | "edit" | "save" | "error";

type Data = { [name: string]: string };

export default function SiteSettings({}) {
  const testEmailRef = useRef<InputRef>(null);
  const [disableTests, setDisableTests] = useState<boolean>(false);
  const [state, setState] = useState<State>("view");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [edited, setEdited] = useState<Data | null>(null);
  const [isReadonly, setIsReadonly] = useState<{
    [name: string]: boolean;
  } | null>(null);

  async function load(): Promise<void> {
    setState("load");
    let result: any;
    try {
      result = await query({
        query: {
          site_settings: [{ name: null, value: null, readonly: null }],
        },
      });
    } catch (err) {
      setState("error");
      setError(`${err} – query error, please try again…`);
      return;
    }
    const data: { [name: string]: string } = {};
    const isReadonly: { [name: string]: boolean } = {};
    for (const x of result.query.site_settings) {
      data[x.name] = x.value;
      isReadonly[x.name] = !!x.readonly;
    }
    setState("edit");
    setError("");
    setData(data);
    setIsReadonly(isReadonly);
    setEdited(deep_copy(data));
    setDisableTests(false);
  }

  function toggleView() {
    switch (state) {
      case "view":
      case "error":
        load();
      case "edit":
        cancel();
    }
  }

  // returns true if the given settings key is a header
  function isHeader(name: string): boolean {
    return (
      EXTRAS[name]?.type == "header" ||
      site_settings_conf[name]?.type == "header"
    );
  }

  async function store(): Promise<void> {
    if (data == null || edited == null) return;
    for (const name in edited) {
      const value = edited[name];
      if (isHeader[name]) continue;
      if (!isEqual(value, data[name])) {
        try {
          await query({
            query: {
              site_settings: { name, value },
            },
          });
        } catch (err) {
          setState("error");
          setError(err);
          return;
        }
      }
    }
  }

  async function save(): Promise<void> {
    setState("save");
    await store();
    setState("view");
    await load();
  }

  function cancel(): void {
    setState("view");
  }

  function SaveButton() {
    if (data == null || edited == null) return null;
    let disabled: boolean = true;
    for (const name in edited) {
      const value = edited[name];
      if (!isEqual(value, data[name])) {
        disabled = false;
        break;
      }
    }

    return (
      <Button bsStyle="success" disabled={disabled} onClick={save}>
        Save
      </Button>
    );
  }

  function CancelButton() {
    return <Button onClick={cancel}>Cancel</Button>;
  }

  function onChangeEntry(name, val) {
    if (edited == null) return;
    const e = copy(edited);
    e[name] = val;
    setEdited(e);
  }

  function onJsonEntryChange(name: string, new_val?: string) {
    if (edited == null) return; // typescript
    const e = copy(edited);
    try {
      if (new_val == null) return;
      JSON.parse(new_val); // does it throw?
      e[name] = new_val;
      setEdited(e);
    } catch (err) {
      console.warn(`Error saving json of ${name}`, err.message);
    }
  }

  function Buttons() {
    return (
      <div>
        <SaveButton />
        <Space />
        <CancelButton />
      </div>
    );
  }

  async function sendTestEmail(
    type: "password_reset" | "invite_email" | "mention" | "verification"
  ): Promise<void> {
    const email = testEmailRef.current?.input?.value;
    if (!email) {
      alert_message({
        type: "error",
        message: "NOT sending test email, since email field is empty",
      });
      return;
    }
    alert_message({
      type: "info",
      message: `sending test email "${type}" to ${email}`,
    });
    // saving info
    await store();
    setDisableTests(true);
    // wait 3 secs
    await delay(3000);
    switch (type) {
      case "password_reset":
        redux.getActions("account").forgot_password(email);
        break;
      case "invite_email":
        alert_message({
          type: "error",
          message: "Simulated invite emails are not implemented yet",
        });
        break;
      case "mention":
        alert_message({
          type: "error",
          message: "Simulated mention emails are not implemented yet",
        });
        break;
      case "verification":
        // The code below "looks good" but it doesn't work ???
        // const users = await user_search({
        //   query: email,
        //   admin: true,
        //   limit: 1
        // });
        // if (users.length == 1) {
        //   await webapp_client.account_client.send_verification_email(users[0].account_id);
        // }
        break;
      default:
        unreachable(type);
    }
    setDisableTests(false);
  }

  function Tests() {
    return (
      <div style={{ marginBottom: "1rem" }}>
        <strong>Tests:</strong>
        <Space />
        Email:
        <Space />
        <Input
          style={{ width: "auto" }}
          defaultValue={redux.getStore("account").get("email_address")}
          ref={testEmailRef}
        />
        <Button
          style={{ marginLeft: "10px" }}
          bsSize={"small"}
          disabled={disableTests}
          onClick={() => sendTestEmail("password_reset")}
        >
          Send Test Forgot Password Email
        </Button>
        {
          // commented out since they aren't implemented
          // <Button
          //   disabled={disableTests}
          //   bsSize={"small"}
          //   onClick={() => sendTestEmail("verification")}
          // >
          //   Verify
          // </Button>
        }
        {
          // <Button
          //   disabled={disableTests}
          //   bsSize={"small"}
          //   onClick={() => sendTestEmail("invite_email")}
          // >
          //   Invite
          // </Button>
          // <Button
          //   disabled={disableTests}
          //   bsSize={"small"}
          //   onClick={() => sendTestEmail("mention")}
          // >
          //   @mention
          // </Button>
        }
      </div>
    );
  }

  function Warning() {
    return (
      <div
        style={{
          margin: " 15px 0",
          background: "white",
          padding: "15px",
          border: "1px solid lightgrey",
        }}
      >
        <b>Important:</b>{" "}
        <i>
          Most settings will take effect within 1 minute of saving them;
          however, some might require restarting the server. If the box
          containing a setting is red, that means the value that you entered is
          invalid. Also, the form below are not very nice since it is not user
          facing; we plan to implement a nicer interface someday.
        </i>
      </div>
    );
  }

  const editRows = useMemo(() => {
    if (state != "edit") return null;
    return (
      <>
        {keys(site_settings_conf).map((name) => (
          <RenderRow
            key={name}
            name={name}
            conf={site_settings_conf[name]}
            edited={edited}
            isReadonly={isReadonly}
            onChangeEntry={onChangeEntry}
            onJsonEntryChange={onJsonEntryChange}
          />
        ))}
        {keys(EXTRAS).map((name) => (
          <RenderRow
            key={name}
            name={name}
            conf={EXTRAS[name]}
            edited={edited}
            isReadonly={isReadonly}
            onChangeEntry={onChangeEntry}
            onJsonEntryChange={onJsonEntryChange}
          />
        ))}
      </>
    );
  }, [state]);

  function Header() {
    return (
      <Title
        level={4}
        onClick={() => toggleView()}
        style={{ cursor: "pointer" }}
      >
        <Icon
          style={{ width: "20px" }}
          name={state == "edit" ? "caret-down" : "caret-right"}
        />{" "}
        Site Settings
      </Title>
    );
  }

  return (
    <div>
      <Header />
      {error && <ErrorDisplay error={error} onClose={() => setError("")} />}
      {state == "edit" && (
        <Well
          style={{
            margin: "auto",
            maxWidth: "80%",
          }}
        >
          <Warning />
          <Buttons />
          {editRows}
          <Space />
          <Tests />
          <Buttons />
        </Well>
      )}
      {state == "save" && <div>Saving site configuration...</div>}
      {state == "load" && <div>Loading site configuration...</div>}
    </div>
  );
}

function rowEntryStyle(value, valid?: ConfigValid): CSSProperties {
  if (
    (Array.isArray(valid) && !valid.includes(value)) ||
    (typeof valid == "function" && !valid(value))
  ) {
    return { backgroundColor: "red", color: "white" };
  }
  return {};
}

function RowEntryInner({
  name,
  value,
  valid,
  password,
  multiline,
  onChangeEntry,
  isReadonly,
}) {
  if (isReadonly == null) return null; // typescript
  const disabled = isReadonly[name] == true;

  if (Array.isArray(valid)) {
    /* This antd code below is broken because something about
         antd is broken.  Maybe it is a bug in antd.
         Even the first official example in the antd
         docs breaks for me!
         See https://github.com/sagemathinc/cocalc/issues/4714
         */
    /*return
        <Select
          defaultValue={value}
          onChange={(val) => onChangeEntry(name, val)}
          style={{ width: "100%" }}
        >
          {valid.map((e) => (
            <Option value={e} key={e}>
              {e}
            </Option>
          ))}
        </Select>
      );
      */
    return (
      <select
        defaultValue={value}
        disabled={disabled}
        onChange={(event) => onChangeEntry(name, event.target.value)}
        style={{ width: "100%" }}
      >
        {valid.map((e) => (
          <option value={e} key={e}>
            {e}
          </option>
        ))}
      </select>
    );
  } else {
    if (password) {
      return (
        <Input.Password
          style={rowEntryStyle(value, valid)}
          defaultValue={value}
          visibilityToggle={true}
          disabled={disabled}
          onChange={(e) => onChangeEntry(name, e.target.value)}
        />
      );
    } else {
      if (multiline != null) {
        const style = Object.assign(rowEntryStyle(value, valid), {
          fontFamily: "monospace",
          fontSize: "80%",
        } as CSSProperties);
        return (
          <Input.TextArea
            rows={4}
            style={style}
            defaultValue={value}
            disabled={disabled}
            onChange={(e) => onChangeEntry(name, e.target.value)}
          />
        );
      } else {
        return (
          <Input
            style={rowEntryStyle(value, valid)}
            defaultValue={value}
            disabled={disabled}
            onChange={(e) => onChangeEntry(name, e.target.value)}
            // allowClear always disabled; otherwise it's not possible to edit the value
            allowClear={false}
          />
        );
      }
    }
  }
}

function RowEntry({
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
}: {
  name: string;
  value: string;
  password: boolean;
  displayed_val?: string;
  valid?: ConfigValid;
  hint?;
  rowType?: RowType;
  multiline?: number;
  isReadonly;
  onJsonEntryChange;
  onChangeEntry;
}) {
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
  const quotas = Object.assign({}, dflt, jval);
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

function RenderRow({
  name,
  conf,
  edited,
  isReadonly,
  onChangeEntry,
  onJsonEntryChange,
}) {
  if (edited == null) return null;
  if (conf.cocalc_only) {
    if (!document.location.host.endsWith("cocalc.com")) {
      return null;
    }
  }
  // don't show certain fields, i.e. where show evals to false
  if (typeof conf.show == "function" && !conf.show(edited)) {
    return null;
  }
  const rawValue = edited?.[name] ?? conf.default;
  const rowType: RowType = conf.type ?? "setting";

  // fallbacks: to_display? → to_val? → undefined
  const parsed_value: string | undefined =
    typeof conf.to_display == "function"
      ? `${conf.to_display(rawValue)}`
      : typeof conf.to_val == "function"
      ? `${conf.to_val(rawValue, edited)}`
      : undefined;

  // not currently supported.
  // const clearable = conf.clearable ?? false;

  const label = (
    <div style={{ paddingRight: "15px" }}>
      <strong>{conf.name}</strong> <RowHelp help={conf.help} />
      <br />
      <StaticMarkdown style={{ fontSize: "90%" }} value={conf.desc} />
    </div>
  );

  const hint = <RowHint conf={conf} rawValue={rawValue} />;

  const style = { marginTop: "15px" } as CSSProperties;
  // indent optional fields
  if (typeof conf.show == "function" && rowType == "setting") {
    Object.assign(style, {
      borderLeft: `2px solid ${COLORS.GRAY}`,
      marginLeft: "0px",
      paddingLeft: "5px",
      marginTop: "0px",
    } as CSSProperties);
  }

  return (
    <LabeledRow label={label} key={name} style={style}>
      <RowEntry
        name={name}
        value={rawValue}
        password={conf.password ?? false}
        displayed_val={parsed_value}
        valid={conf.valid}
        hint={hint}
        rowType={rowType}
        multiline={conf.multiline}
        isReadonly={isReadonly}
        onJsonEntryChange={onJsonEntryChange}
        onChangeEntry={onChangeEntry}
      />
    </LabeledRow>
  );
}

function RowHint({ conf, rawValue }: { conf: Config; rawValue: string }) {
  if (typeof conf.hint == "function") {
    return <Markdown value={conf.hint(rawValue)} />;
  } else {
    return null;
  }
}

function RowHelp({ help }: { help?: string }) {
  if (typeof help !== "string") return null;
  return (
    <Popover
      content={
        <StaticMarkdown
          className={"admin-site-setting-popover-help"}
          style={{ fontSize: "90%" }}
          value={help}
        />
      }
      trigger={["hover", "click"]}
      placement="right"
      overlayStyle={{ maxWidth: "500px" }}
    >
      <Icon style={{ color: COLORS.GRAY }} name="question-circle" />
    </Popover>
  );
}
