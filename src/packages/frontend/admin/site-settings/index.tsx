/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Tag as AntdTag,
  Button,
  Col,
  Input,
  InputRef,
  Modal,
  Row,
} from "antd";
import { isEqual } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Well } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Gap, Icon, Loading, Paragraph } from "@cocalc/frontend/components";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { TAGS, Tag } from "@cocalc/util/db-schema/site-defaults";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { deep_copy, keys } from "@cocalc/util/misc";
import { site_settings_conf } from "@cocalc/util/schema";
import { RenderRow } from "./render-row";
import { Data, IsReadonly, State } from "./types";
import {
  toCustomOpenAIModel,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import ShowError from "@cocalc/frontend/components/error";

const { CheckableTag } = AntdTag;

export default function SiteSettings({ close }) {
  const { inc: change } = useCounter();
  const testEmailRef = useRef<InputRef>(null);
  const [_, setDisableTests] = useState<boolean>(false);
  const [state, setState] = useState<State>("load");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [filterStr, setFilterStr] = useState<string>("");
  const [filterTag, setFilterTag] = useState<Tag | null>(null);
  const editedRef = useRef<Data | null>(null);
  const savedRef = useRef<Data | null>(null);
  const [isReadonly, setIsReadonly] = useState<IsReadonly | null>(null);
  const update = () => {
    setData(deep_copy(editedRef.current));
  };

  useEffect(() => {
    load();
  }, []);

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
            setState("edit");
            await load();
            done();
          } catch (err) {
            error(err);
          }
        });
      },
      onCancel() {
        close();
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
    return <Button onClick={close}>Cancel</Button>;
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
          keys(configData).map((name) => {
            const conf = configData[name];

            // This is a weird special case, where the valid value depends on other values
            if (name === "default_llm") {
              const c = site_settings_conf.selectable_llms;
              const llms = c.to_val?.(data?.selectable_llms ?? c.default) ?? [];
              const o = EXTRAS.ollama_configuration;
              const oll = Object.keys(
                o.to_val?.(data?.ollama_configuration) ?? {},
              ).map(toOllamaModel);
              const a = EXTRAS.ollama_configuration;
              const oaic = data?.custom_openai_configuration;
              const oai = (
                oaic != null ? Object.keys(a.to_val?.(oaic) ?? {}) : []
              ).map(toCustomOpenAIModel);
              if (Array.isArray(llms)) {
                conf.valid = [...llms, ...oll, ...oai];
              }
            }

            return (
              <RenderRow
                filterStr={filterStr}
                filterTag={filterTag}
                key={name}
                name={name}
                conf={conf}
                data={data}
                update={update}
                isReadonly={isReadonly}
                onChangeEntry={onChangeEntry}
                onJsonEntryChange={onJsonEntryChange}
                isModified={isModified}
                isHeader={isHeader(name)}
                saveSingleSetting={saveSingleSetting}
              />
            );
          }),
        )}
      </>
    );
  }, [state, data, filterStr, filterTag]);

  const activeFilter = !filterStr.trim() || filterTag;

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
      <Well
        style={{
          margin: "auto",
          maxWidth: "80%",
        }}
      >
        <Warning />
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "30px auto", maxWidth: "800px" }}
        />
        <Row key="filter">
          <Col span={12}>
            <Buttons />
          </Col>
          <Col span={12}>
            <Input.Search
              style={{ marginBottom: "5px" }}
              allowClear
              value={filterStr}
              placeholder="Filter Site Settings..."
              onChange={(e) => setFilterStr(e.target.value)}
            />
            {[...TAGS].sort().map((name) => (
              <CheckableTag
                key={name}
                style={{ cursor: "pointer" }}
                checked={filterTag === name}
                onChange={(checked) => {
                  if (checked) {
                    setFilterTag(name);
                  } else {
                    setFilterTag(null);
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
        {!activeFilter && <Tests />}
        {!activeFilter && <Buttons />}
        {activeFilter ? (
          <Alert
            showIcon
            type="warning"
            message={`Some items may be hidden by the search filter or a selected tag.`}
          />
        ) : undefined}
      </Well>
    </div>
  );
}
