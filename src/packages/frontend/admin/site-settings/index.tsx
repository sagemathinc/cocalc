/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Col, Input, InputRef, Modal, Row, Tag } from "antd";
import { delay } from "awaiting";
import { isEqual } from "lodash";
import { useMemo, useRef, useState } from "react";

import { alert_message } from "@cocalc/frontend/alerts";
import { Well } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import {
  Gap,
  Icon,
  Loading,
  Paragraph,
  Title,
} from "@cocalc/frontend/components";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { deep_copy, keys, unreachable } from "@cocalc/util/misc";
import { site_settings_conf } from "@cocalc/util/schema";
import { RenderRow } from "./render-row";
import { Data, IsReadonly, State } from "./types";

const { CheckableTag } = Tag;

export default function SiteSettings({}) {
  const { inc: change } = useCounter();
  const testEmailRef = useRef<InputRef>(null);
  const [disableTests, setDisableTests] = useState<boolean>(false);
  const [state, setState] = useState<State>("view");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<string>("");
  const editedRef = useRef<Data | null>(null);
  const savedRef = useRef<Data | null>(null);
  const [isReadonly, setIsReadonly] = useState<IsReadonly | null>(null);
  const update = () => {
    setData(deep_copy(editedRef.current));
  };

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
    const isReadonly: IsReadonly = {};
    for (const x of result.query.site_settings) {
      data[x.name] = x.value;
      isReadonly[x.name] = !!x.readonly;
    }
    setState("edit");
    setData(data);
    setIsReadonly(isReadonly);
    editedRef.current = deep_copy(data);
    savedRef.current = deep_copy(data);
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

  function isModified(name: string) {
    if (data == null || editedRef.current == null || savedRef.current == null)
      return false;

    const edited = editedRef.current[name];
    const saved = savedRef.current[name];
    return !isEqual(edited, saved);
  }

  function getModifiedSettings() {
    if (data == null || editedRef.current == null || savedRef.current == null)
      return [];

    const ret: { name: string; value: string }[] = [];
    for (const name in editedRef.current) {
      const value = editedRef.current[name];
      if (isHeader[name]) continue;
      if (isModified(name)) {
        ret.push({ name, value });
      }
    }
    ret.sort((a, b) => a.name.localeCompare(b.name));
    return ret;
  }

  async function store(): Promise<void> {
    if (data == null || editedRef.current == null || savedRef.current == null)
      return;
    for (const { name, value } of getModifiedSettings()) {
      try {
        await query({
          query: {
            site_settings: { name, value },
          },
        });
        savedRef.current[name] = value;
      } catch (err) {
        setState("error");
        setError(err);
        return;
      }
    }
    // success save of everything, so clear error message
    setError("");
  }

  async function saveAll(): Promise<void> {
    // list the names of changed settings
    const content = (
      <Paragraph>
        <ul>
          {getModifiedSettings().map(({ name, value }) => {
            const label =
              (site_settings_conf[name] ?? EXTRAS[name]).name ?? name;
            return (
              <li key={name}>
                <b>{label}</b>: <code>{value}</code>
              </li>
            );
          })}
        </ul>
      </Paragraph>
    );

    setState("save");

    Modal.confirm({
      title: "Confirm changing the following settings?",
      icon: <Icon name="warning" />,
      width: 700,
      content,
      onOk() {
        return new Promise<void>(async (done, error) => {
          try {
            await store();
            setState("view");
            await load();
            done();
          } catch (err) {
            error(err);
          }
        });
      },
      onCancel() {
        setState("edit");
      },
    });
  }

  // this is the small grene button, there is no confirmation
  async function saveSingleSetting(name: string): Promise<void> {
    if (data == null || editedRef.current == null || savedRef.current == null)
      return;
    const value = editedRef.current[name];
    setState("save");
    try {
      await query({
        query: {
          site_settings: { name, value },
        },
      });
      savedRef.current[name] = value;
      setState("edit");
    } catch (err) {
      setState("error");
      setError(err);
      return;
    }
  }

  function cancel(): void {
    setState("view");
    setData(deep_copy(savedRef.current));
  }

  function SaveButton() {
    if (data == null || savedRef.current == null) return null;
    let disabled: boolean = true;
    for (const name in { ...savedRef.current, ...data }) {
      const value = savedRef.current[name];
      if (!isEqual(value, data[name])) {
        disabled = false;
        break;
      }
    }

    return (
      <Button type="primary" disabled={disabled} onClick={saveAll}>
        {state == "save" ? <Loading text="Saving" /> : "Save All"}
      </Button>
    );
  }

  function CancelButton() {
    return <Button onClick={cancel}>Cancel</Button>;
  }

  function onChangeEntry(name: string, val: string) {
    if (editedRef.current == null) return;
    editedRef.current[name] = val;
    change();
    update();
  }

  function onJsonEntryChange(name: string, new_val?: string) {
    if (editedRef.current == null) return;
    try {
      if (new_val == null) return;
      JSON.parse(new_val); // does it throw?
      editedRef.current[name] = new_val;
    } catch (err) {
      // TODO: obviously this should be visible to the user!  Gees.
      console.warn(`Error saving json of ${name}`, err.message);
    }
    change();
    update(); // without that, the "green save button" does not show up. this makes it consistent.
  }

  function Buttons() {
    return (
      <div>
        <CancelButton />
        <Gap />
        <SaveButton />
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
        <Gap />
        Email:
        <Gap />
        <Input
          style={{ width: "auto" }}
          defaultValue={redux.getStore("account").get("email_address")}
          ref={testEmailRef}
        />
        <Button
          style={{ marginLeft: "10px" }}
          size={"small"}
          disabled={disableTests}
          onClick={() => sendTestEmail("password_reset")}
        >
          Send Test Forgot Password Email
        </Button>
        {
          // commented out since they aren't implemented
          // <Button
          //   disabled={disableTests}
          //   size={"small"}
          //   onClick={() => sendTestEmail("verification")}
          // >
          //   Verify
          // </Button>
        }
        {
          // <Button
          //   disabled={disableTests}
          //   size={"small"}
          //   onClick={() => sendTestEmail("invite_email")}
          // >
          //   Invite
          // </Button>
          // <Button
          //   disabled={disableTests}
          //   size={"small"}
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
      <div>
        <Alert
          type="warning"
          style={{
            maxWidth: "800px",
            margin: "0 auto 20px auto",
            border: "1px solid lightgrey",
          }}
          message={
            <div>
              <i>
                <ul style={{ marginBottom: 0 }}>
                  <li>
                    Most settings will take effect within 1 minute of save;
                    however, some might require restarting the server.
                  </li>
                  <li>
                    If the box containing a setting has a red border, that means
                    the value that you entered is invalid.
                  </li>
                </ul>
              </i>
            </div>
          }
        />
      </div>
    );
  }

  const editRows = useMemo(() => {
    return (
      <>
        {[site_settings_conf, EXTRAS].map((configData) =>
          keys(configData).map((name) => (
            <RenderRow
              filter={filter}
              key={name}
              name={name}
              conf={configData[name]}
              data={data}
              update={update}
              isReadonly={isReadonly}
              onChangeEntry={onChangeEntry}
              onJsonEntryChange={onJsonEntryChange}
              isModified={isModified}
              isHeader={isHeader(name)}
              saveSingleSetting={saveSingleSetting}
            />
          ))
        )}
      </>
    );
  }, [state, data, filter]);

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

  if (state == "view") return <Header />;

  return (
    <div>
      {state == "save" && (
        <Loading
          delay={1000}
          style={{ float: "right", fontSize: "15pt" }}
          text="Saving site configuration..."
        />
      )}
      {state == "load" && (
        <Loading
          delay={1000}
          style={{ float: "right", fontSize: "15pt" }}
          text="Loading site configuration..."
        />
      )}
      <Header />
      <Well
        style={{
          margin: "auto",
          maxWidth: "80%",
        }}
      >
        <Warning />
        {error && (
          <Alert
            type="error"
            showIcon
            closable
            description={error}
            onClose={() => setError("")}
            style={{ margin: "30px auto", maxWidth: "800px" }}
          />
        )}
        <Row key="filter">
          <Col span={12}>
            <Buttons />
          </Col>
          <Col span={12}>
            <Input.Search
              style={{ marginBottom: "5px" }}
              allowClear
              value={filter}
              placeholder="Filter Site Settings..."
              onChange={(e) => setFilter(e.target.value)}
            />
            {[
              "openai",
              "jupyter",
              "email",
              "logo",
              "version",
              "stripe",
              "captcha",
              "zendesk",
              "github",
              "pay as you go",
            ].map((name) => (
              <CheckableTag
                key={name}
                style={{ cursor: "pointer" }}
                checked={!!filter?.includes(name)}
                onChange={(checked) => {
                  if (checked) {
                    setFilter(name);
                  } else {
                    setFilter("");
                  }
                }}
              >
                {name}
              </CheckableTag>
            ))}
          </Col>
        </Row>
        {editRows}
        <Gap />
        {!filter.trim() && <Tests />}
        {!filter.trim() && <Buttons />}
        {filter.trim() && (
          <Alert
            showIcon
            type="warning"
            message={`Some items may be hidden by the filter.`}
          />
        )}
      </Well>
    </div>
  );
}
