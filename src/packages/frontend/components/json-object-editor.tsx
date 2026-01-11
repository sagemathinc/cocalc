/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Generic JSON object editor with a structured view and an advanced raw JSON
toggle. Intended for admin/config use.
*/

import { Button, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import jsonic from "jsonic";

import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";

const { Text } = Typography;

type JsonValueType = "string" | "number" | "boolean" | "json";

interface JsonRow {
  id: string;
  key: string;
  type: JsonValueType;
  value: string | number | boolean;
}

function toJsonText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function objectToRows(value: unknown): JsonRow[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).map((key) => {
    const val = (value as Record<string, unknown>)[key];
    if (typeof val === "boolean") {
      return { id: `${key}-${Math.random()}`, key, type: "boolean", value: val };
    }
    if (typeof val === "number") {
      return { id: `${key}-${Math.random()}`, key, type: "number", value: val };
    }
    if (val != null && typeof val === "object") {
      return {
        id: `${key}-${Math.random()}`,
        key,
        type: "json",
        value: JSON.stringify(val),
      };
    }
    return {
      id: `${key}-${Math.random()}`,
      key,
      type: "string",
      value: val == null ? "" : String(val),
    };
  });
}

function buildObject(rows: JsonRow[]) {
  const result: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (seen.has(key)) {
      return { error: `Duplicate key "${key}".` };
    }
    seen.add(key);
    if (row.type === "number") {
      const num = typeof row.value === "number" ? row.value : Number(row.value);
      if (!Number.isFinite(num)) {
        return { error: `Value for "${key}" must be a number.` };
      }
      result[key] = num;
    } else if (row.type === "boolean") {
      result[key] = Boolean(row.value);
    } else if (row.type === "json") {
      try {
        const parsed = jsonic(String(row.value ?? ""));
        result[key] = parsed;
      } catch (err) {
        return { error: `Invalid JSON for "${key}": ${err}` };
      }
    } else {
      result[key] = String(row.value ?? "");
    }
  }
  return { value: result };
}

export function JsonObjectEditor({
  value,
  onChange,
  onErrorChange,
  emptyHint,
}: {
  value?: Record<string, unknown>;
  onChange?: (value: Record<string, unknown>) => void;
  onErrorChange?: (error: string) => void;
  emptyHint?: string;
}) {
  const [rows, setRows] = React.useState<JsonRow[]>([]);
  const [advanced, setAdvanced] = React.useState(false);
  const [rawJson, setRawJson] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");
  const [rawError, setRawError] = React.useState<string>("");
  const lastValueSignatureRef = React.useRef<string | null>(null);
  const lastEmittedSignatureRef = React.useRef<string | null>(null);
  const lastErrorRef = React.useRef<string>("");
  const structuredSupported =
    value == null || (typeof value === "object" && !Array.isArray(value));
  const valueSignature = React.useMemo(
    () => toJsonText(value) ?? "",
    [value],
  );

  React.useEffect(() => {
    if (!structuredSupported) {
      setAdvanced(true);
    }
    if (lastValueSignatureRef.current === valueSignature) {
      return;
    }
    if (lastEmittedSignatureRef.current === valueSignature) {
      lastValueSignatureRef.current = valueSignature;
      return;
    }
    lastValueSignatureRef.current = valueSignature;
    setRows(objectToRows(value));
    setRawJson(valueSignature);
    setError("");
    setRawError("");
  }, [valueSignature, structuredSupported, value]);

  React.useEffect(() => {
    const nextError = (error || rawError).trim();
    if (lastErrorRef.current === nextError) {
      return;
    }
    lastErrorRef.current = nextError;
    if (onErrorChange) {
      onErrorChange(nextError);
    }
  }, [error, rawError, onErrorChange]);

  const syncRows = (nextRows: JsonRow[]) => {
    setRows(nextRows);
    const { value: nextValue, error: nextError } = buildObject(nextRows);
    if (nextError) {
      setError(nextError);
      return;
    }
    setError("");
    if (nextValue) {
      lastEmittedSignatureRef.current = toJsonText(nextValue) ?? "";
      onChange?.(nextValue);
      setRawJson(toJsonText(nextValue) ?? "");
      setRawError("");
    }
  };

  const addRow = () => {
    const next = [
      ...rows,
      {
        id: `row-${Math.random()}`,
        key: "",
        type: "string" as JsonValueType,
        value: "",
      },
    ];
    syncRows(next);
  };

  const removeRow = (id: string) => {
    const next = rows.filter((row) => row.id !== id);
    syncRows(next);
  };

  const updateRow = (id: string, changes: Partial<JsonRow>) => {
    const next = rows.map((row) => {
      if (row.id !== id) return row;
      let value = changes.value ?? row.value;
      let type = (changes.type ?? row.type) as JsonValueType;
      if (changes.type && changes.type !== row.type) {
        if (type === "number") value = 0;
        if (type === "boolean") value = false;
        if (type === "json") value = "{}";
        if (type === "string") value = "";
      }
      return { ...row, ...changes, value, type };
    });
    syncRows(next);
  };

  const onRawChange = (next: string) => {
    setRawJson(next);
    if (next.trim() === "") {
      setRawError("");
      onChange?.({});
      setRows([]);
      return;
    }
    try {
      const parsed = jsonic(next);
      if (parsed != null && typeof parsed !== "object") {
        throw Error("Expected a JSON object");
      }
      if (Array.isArray(parsed)) {
        throw Error("Arrays are only supported in Advanced JSON");
      }
      setRawError("");
      lastEmittedSignatureRef.current = toJsonText(parsed ?? {}) ?? "";
      onChange?.(parsed ?? {});
      setRows(objectToRows(parsed ?? {}));
    } catch (err) {
      setRawError(`Invalid JSON: ${err}`);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: "8px" }} size="small">
        <Button size="small" onClick={addRow}>
          <Icon name="plus" /> Add entry
        </Button>
        <Switch
          size="small"
          checked={advanced}
          onChange={(checked) => setAdvanced(checked)}
        />
        <Text type="secondary">Advanced JSON</Text>
      </Space>
      {!structuredSupported && (
        <Text type="warning">
          Structured editor supports objects only. Use Advanced JSON.
        </Text>
      )}
      {structuredSupported && rows.length === 0 && (
        <Text type="secondary">{emptyHint ?? "No entries yet."}</Text>
      )}
      {structuredSupported &&
        rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <Input
              value={row.key}
              placeholder="key"
              onChange={(e) => updateRow(row.id, { key: e.target.value })}
              style={{ width: "30%" }}
            />
            <Select
              value={row.type}
              onChange={(type) => updateRow(row.id, { type })}
              style={{ width: "120px" }}
              options={[
                { label: "String", value: "string" },
                { label: "Number", value: "number" },
                { label: "Boolean", value: "boolean" },
                { label: "JSON", value: "json" },
              ]}
            />
            <div style={{ flex: 1 }}>
              {row.type === "number" && (
                <InputNumber
                  value={Number(row.value)}
                  onChange={(val) => updateRow(row.id, { value: val ?? 0 })}
                  style={{ width: "100%" }}
                />
              )}
              {row.type === "boolean" && (
                <Switch
                  checked={Boolean(row.value)}
                  onChange={(val) => updateRow(row.id, { value: val })}
                />
              )}
              {row.type === "string" && (
                <Input
                  value={String(row.value ?? "")}
                  onChange={(e) => updateRow(row.id, { value: e.target.value })}
                />
              )}
              {row.type === "json" && (
                <Input.TextArea
                  rows={2}
                  value={String(row.value ?? "")}
                  onChange={(e) =>
                    updateRow(row.id, { value: e.target.value })
                  }
                />
              )}
            </div>
            <Button size="small" onClick={() => removeRow(row.id)}>
              <Icon name="trash" />
            </Button>
          </div>
        ))}
      {error && (
        <Text type="danger" style={{ display: "block", marginBottom: "6px" }}>
          {error}
        </Text>
      )}
      {advanced && (
        <div>
          <Input.TextArea
            rows={4}
            placeholder="{}"
            value={rawJson}
            onChange={(e) => onRawChange(e.target.value)}
          />
          {rawError && (
            <Text type="danger" style={{ display: "block", marginTop: "6px" }}>
              {rawError}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
