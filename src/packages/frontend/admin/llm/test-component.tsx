import { Alert, Space } from "antd";
import { throttle } from "lodash";

import {
  useAsyncEffect,
  useEffect,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { Markdown } from "@cocalc/frontend/markdown";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { LanguageModelCore } from "@cocalc/util/db-schema/llm-utils";
import { PROMPTS } from "./tests";
import { Value } from "./value";

interface TestLLMProps {
  model: LanguageModelCore | string;
  test: number | null;
  queryState: [boolean | undefined, (val: boolean) => void];
}

export function TestLLM({ model, test, queryState }: TestLLMProps) {
  const [querying, setQuerying] = queryState;
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [passed, setPassed] = useState<boolean | undefined>();

  const {
    prompt,
    expected,
    system = undefined,
    history = undefined,
  } = typeof test === "number" ? PROMPTS[test] : { prompt: "", expected: "" };
  const expectedRegex = new RegExp(expected, "g");

  const check = throttle(
    () => {
      if (passed != null && output.trim() === "") {
        setPassed(undefined);
      } else if (expectedRegex.test(output) && !passed) {
        setPassed(true);
      }
    },
    250,
    {
      leading: false,
      trailing: true,
    },
  );

  useEffect(() => {
    if (prompt.trim() === "") {
      setOutput("");
      setError("");
      setPassed(undefined);
    }
  }, [prompt, test]);

  useEffect(() => {
    check();
  }, [output]);

  useAsyncEffect(async () => {
    if (!querying || prompt.trim() === "") {
      querying && setQuerying(false);
      setError("");
      return;
    }

    try {
      setPassed(undefined);
      const llmStream = webapp_client.openai_client.queryStream({
        input: prompt,
        project_id: null,
        tag: "admin-llm-test",
        model,
        system,
        history,
        maxTokens: 20,
      });

      let reply = "";
      llmStream.on("token", (token) => {
        if (token) {
          reply += token;
          setOutput(reply);
        }
      });

      llmStream.on("error", (err) => {
        setPassed(false);
        setError(err?.toString());
        setQuerying(false);
      });
    } catch (err) {
      setError(err?.toString());
    } finally {
      setQuerying(false);
    }
  }, [querying]);

  function renderPassed() {
    if (typeof passed === "boolean") {
      return <Value val={passed} />;
    } else {
      return <Icon unicode={0x2753} />;
    }
  }

  if (querying) {
    return <Loading />;
  }

  return (
    <>
      <Space direction="horizontal" align="start">
        {renderPassed()} <Markdown value={output} />
      </Space>
      {error ? <Alert banner type="error" message={error} /> : undefined}
    </>
  );
}
