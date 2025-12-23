import { Button, Popover, Progress, Space } from "antd";
import { BaseType } from "antd/es/typography/Base";

import { CSS } from "@cocalc/frontend/app-framework";
import { A, HelpIcon, Paragraph, Text } from "@cocalc/frontend/components";
import type {
  LLMUsageStatus as LLMUsageStatusResponse,
  LLMUsageWindowStatus,
} from "@cocalc/conat/hub/api/purchases";
import type { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { round2down, round2up } from "@cocalc/util/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { lite } from "@cocalc/frontend/lite";

/*
NOTE: To get a quick idea about the numbers of how many completion tokens are returned, run this:

```sql
WITH data AS (
  SELECT model, (total_tokens - prompt_tokens) AS val
  FROM openai_chatgpt_log
  WHERE  time >= NOW() - '1 week'::interval
    AND tag like 'app:%'
)
SELECT model, PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY val) AS median
FROM data
GROUP BY model
ORDER BY median desc
```

This gives a range from about 100 to almost 700.
The maximum (just use the "MAX" function, easier than the median) is at almost the token limit (i.e. 2000).

That's the basis for the number 100 and 1000 below!
*/

export function LLMCostEstimation({
  model: _model,
  tokens: _tokens, // Note: use the "await imported" numTokensUpperBound function to get the number of tokens
  type,
  maxOutputTokens: _maxOutputTokens,
  paragraph = false,
  textAlign,
}: {
  model: LanguageModel;
  tokens: number;
  type?: BaseType;
  maxOutputTokens?: number;
  paragraph?: boolean;
  textAlign?: CSS["textAlign"];
}) {
  return (
    <Wrapper type={type} paragraph={paragraph} textAlign={textAlign}>
      <LLMUsageStatus />
    </Wrapper>
  );
}

function Wrapper({
  children,
  type,
  paragraph,
  textAlign = "right",
}: {
  children: React.ReactNode;
  type?: BaseType;
  paragraph?: boolean;
  textAlign?: CSS["textAlign"];
}) {
  const C = paragraph ? Paragraph : Text;
  const style: CSS = paragraph ? { textAlign, marginBottom: 0 } : {};
  return (
    <C style={style} type={type}>
      {children}
    </C>
  );
}

export function calcMinMaxEstimation(
  tokens: number,
  _model,
  _llm_markup,
  maxTokens: number = 1000,
): { min: number; max: number } {
  const min = round2down(tokens * 0);
  const max = round2up(maxTokens * 0);
  return { min, max };
}

export function LLMUsageHelpContent() {
  return (
    <>
      <Paragraph>
        LLM usage is limited by a short 5-hour window and a longer 7-day window.
        When you hit a limit, usage resets automatically.
      </Paragraph>
      <Paragraph>
        Upgrade your membership for higher limits.{" "}
        <A href="/store/membership">View membership tiers</A>.
      </Paragraph>
    </>
  );
}

export function LLMUsageStatus({
  variant = "full",
  showHelp = true,
  compactWidth,
  compactSingle = false,
}: {
  variant?: "full" | "compact";
  showHelp?: boolean;
  compactWidth?: number;
  compactSingle?: boolean;
}) {
  const [status, setStatus] = useState<LLMUsageStatusResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result =
          await webapp_client.conat_client.hub.purchases.getLLMUsage();
        if (!cancelled) {
          setStatus(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  if (lite) return null;

  if (error) {
    return <Text type="secondary">LLM usage unavailable.</Text>;
  }
  if (loading || !status) {
    return <Text type="secondary">Loading usage…</Text>;
  }

  const window5h = status.windows.find((w) => w.window === "5h");
  const window7d = status.windows.find((w) => w.window === "7d");

  const content = (
    <>
      <div style={{ textAlign: "left" }}>
        <UsageBar label="5-hour limit" window={window5h} />
        <UsageBar label="7-day limit" window={window7d} />
      </div>
      {showHelp && (
        <HelpIcon title="LLM Usage Limits" placement={"topLeft"}>
          <LLMUsageHelpContent />
        </HelpIcon>
      )}
    </>
  );

  if (variant === "compact") {
    const minWidth = compactWidth ?? 180;
    return (
      <Popover content={content} title="LLM Usage" trigger="click">
        <Button
          size="small"
          style={{
            height: "auto",
            padding: "4px 6px",
            fontSize: "11px",
            minWidth: `${minWidth}px`,
          }}
        >
          {compactSingle ? (
            <CompactUsageBar label="5h" window={window5h} />
          ) : (
            <Space direction="vertical" size={2} style={{ width: "100%" }}>
              <div style={{ marginBottom: "-8px" }}>
                <CompactUsageBar label="5h" window={window5h} />
              </div>
              <CompactUsageBar label="7d" window={window7d} />
            </Space>
          )}
        </Button>
      </Popover>
    );
  }

  return content;
}

function UsageBar({
  label,
  window,
}: {
  label: string;
  window?: LLMUsageWindowStatus;
}) {
  if (!window || window.limit == null) {
    return (
      <div style={{ marginBottom: "6px" }}>
        <Text type="secondary">{label}: no limit</Text>
      </div>
    );
  }
  const limit = window.limit;
  const percent =
    limit > 0
      ? Math.min(100, (100 * window.used) / limit)
      : window.used > 0
        ? 100
        : 0;
  const remaining = window.remaining ?? Math.max(0, limit - window.used);
  return (
    <div style={{ marginBottom: "6px" }}>
      <Text type="secondary">
        {label}: {window.used} / {limit} units{" "}
        {window.reset_in ? `· resets in ${window.reset_in}` : ""}
      </Text>
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        status={remaining === 0 ? "exception" : "active"}
      />
    </div>
  );
}

function CompactUsageBar({
  label,
  window,
}: {
  label: string;
  window?: LLMUsageWindowStatus;
}) {
  const limit = window?.limit ?? 0;
  const used = window?.used ?? 0;
  const percent = limit > 0 ? Math.min(100, (100 * used) / limit) : 0;
  const filled = Math.max(0, Math.min(4, Math.round((percent / 100) * 4)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <Text type="secondary" style={{ width: "22px" }}>
        {label}
      </Text>
      <div style={{ display: "flex", gap: "4px", flex: 1 }}>
        {Array.from({ length: 4 }, (_, idx) => (
          <div
            key={`${label}-${idx}`}
            style={{
              flex: 1,
              height: "5px",
              borderRadius: "4px",
              background: idx < filled ? "#1677ff" : "#f0f0f0",
            }}
          />
        ))}
      </div>
    </div>
  );
}
