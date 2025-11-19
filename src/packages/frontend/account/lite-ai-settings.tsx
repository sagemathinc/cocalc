import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Input, Row, Space } from "antd";
import { getLogger } from "@cocalc/frontend/logger";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { Gap, Loading } from "@cocalc/frontend/components";
import { redux } from "@cocalc/frontend/app-framework";

const log = getLogger("account:lite-ai-settings");

type ProviderKey = {
  keyField: string;
  enableField: string;
  label: string;
  placeholder?: string;
};

const PROVIDERS: ProviderKey[] = [
  {
    keyField: "openai_api_key",
    enableField: "openai_enabled",
    label: "OpenAI API Key",
    placeholder: "sk-...",
  },
  {
    keyField: "google_vertexai_key",
    enableField: "google_vertexai_enabled",
    label: "Google Gemini API Key",
    placeholder: "Google AI Studio key",
  },
  {
    keyField: "mistral_api_key",
    enableField: "mistral_enabled",
    label: "Mistral API Key",
  },
  {
    keyField: "anthropic_api_key",
    enableField: "anthropic_enabled",
    label: "Anthropic API Key",
  },
];

type State = "load" | "ready" | "save" | "error";

export default function LiteAISettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<State>("load");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    load();
  }, []);

  async function load(): Promise<void> {
    setState("load");
    try {
      const result = await query({
        query: {
          site_settings: [{ name: null, value: null }],
        },
      });
      const next: Record<string, string> = {};
      for (const row of result.query.site_settings ?? []) {
        next[row.name] = row.value;
      }
      setValues(next);
      setSavedValues(next);
      setError("");
      setState("ready");
    } catch (err) {
      log.info("failed to load llm settings", err);
      setError(`${err}`);
      setState("error");
    }
  }

  function onChange(key: string, val: string) {
    setValues((cur) => ({ ...cur, [key]: val }));
  }

  const saving = state === "save";
  const dirty = useMemo(() => {
    for (const { keyField } of PROVIDERS) {
      if ((values[keyField] ?? "") !== (savedValues[keyField] ?? "")) {
        return true;
      }
    }
    return false;
  }, [values, savedValues]);

  async function save(): Promise<void> {
    if (saving || !dirty) return;
    setState("save");
    try {
      for (const { keyField, enableField } of PROVIDERS) {
        const val = values[keyField] ?? "";
        await query({
          query: { site_settings: { name: keyField, value: val } },
        });
        await query({
          query: {
            site_settings: {
              name: enableField,
              value: val ? "yes" : "no",
            },
          },
        });
      }
      redux.getStore("projects").clearOpenAICache();
      // @ts-ignore
      await redux.getActions("customize")?.reload();
      setSavedValues(values);
      setState("ready");
    } catch (err) {
      log.info("failed to save llm settings", err);
      setError(`${err}`);
      setState("error");
    }
  }

  return (
    <div>
      <h3>AI Provider Keys</h3>
      <p style={{ marginBottom: 12 }}>
        Enter API keys for the providers you want to use. When a key is saved,
        the corresponding AI UI is enabled automatically.
      </p>
      {error && (
        <Alert type="error" message="Error" description={error} closable />
      )}
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {PROVIDERS.map(({ keyField, label, placeholder }) => (
          <Row key={keyField} gutter={8} align="middle">
            <Col span={8}>{label}</Col>
            <Col span={16}>
              <Input.Password
                allowClear
                value={values[keyField] ?? ""}
                placeholder={placeholder}
                onChange={(e) => onChange(keyField, e.target.value)}
              />
            </Col>
          </Row>
        ))}
      </Space>
      <Gap />
      <Button
        type="primary"
        onClick={save}
        disabled={saving || !dirty}
        style={{ marginTop: 8 }}
      >
        {saving ? <Loading text="Saving" /> : "Save"}
      </Button>
    </div>
  );
}
