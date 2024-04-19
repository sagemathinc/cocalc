import { Alert, Button, Col, Input, Row, Select, Space, Switch } from "antd";
import { throttle } from "lodash";

import {
  CSS,
  redux,
  useAsyncEffect,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Loading,
  Paragraph,
  Text,
  Title,
} from "@cocalc/frontend/components";
import { LLMModelName } from "@cocalc/frontend/components/llm-name";
import { Markdown } from "@cocalc/frontend/markdown";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  CoreLanguageModel,
  LLMServiceName,
  LLM_PROVIDER,
  USER_SELECTABLE_LLMS_BY_VENDOR,
  isCoreLanguageModel,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import { getRandomColor } from "@cocalc/util/misc";

const PROMPTS: Readonly<{ prompt: string; expected: string }[]> = [
  { prompt: "What's 9 + 91? Reply only the number!", expected: "100" },
  {
    prompt: "Show me the LaTeX Formula for 'a/(b+c). Reply only the formula!",
    expected: "frac",
  },
] as const;

export function TestLLMAdmin() {
  const customize = redux.getStore("customize");
  const globallyEnabledLLMs = customize.getEnabledLLMs();
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");
  const ollama = useTypedRedux("customize", "ollama");
  const [test, setTest] = useState<number | null>(0);
  // TODO: this is used to trigger sending queries – makes no sense that all of them disable it. fix this.
  const [querying, setQuerying] = useState<boolean>();
  const [all, setAll] = useState<boolean>(false);

  function llmStyle(llm: string): CSS {
    return {
      marginLeft: "5px",
      marginBottom: "5px",
      borderLeft: `5px solid ${getRandomColor(llm, {
        min: 0,
        max: 255,
        diff: 100,
      })}`,
    };
  }

  function renderStatus(llm: CoreLanguageModel, vendor: LLMServiceName) {
    const enabled = all || selectableLLMs.includes(llm);

    return (
      <Row gutter={[10, 20]} style={llmStyle(llm)} key={`${vendor}-${llm}`}>
        <Col md={24}>
          <Space>
            <Value val={enabled} /> <LLMModelName model={llm} />
          </Space>
        </Col>
        <Col md={24}>
          {enabled ? (
            <TestLLM
              test={test}
              model={llm}
              queryState={[querying, setQuerying]}
            />
          ) : undefined}
        </Col>
      </Row>
    );
  }

  return (
    <div>
      <Paragraph>
        Globally enabled LLMs (Admin Settings):
        <Value val={globallyEnabledLLMs} />.
      </Paragraph>
      <Paragraph>
        <Space>
          <Input
            value={test != null ? PROMPTS[test].prompt : ""}
            disabled={true || querying}
            onChange={(e) => setTest(parseInt(e.target.value))}
            placeholder="Enter a query..."
            addonAfter={
              <Select
                onSelect={setTest}
                defaultValue={0}
                popupMatchSelectWidth={false}
              >
                <Select.Option value={0}>Calulate</Select.Option>
                <Select.Option value={1}>Formula</Select.Option>
              </Select>
            }
          />
          <Button
            type="primary"
            onClick={() => setQuerying(true)}
            disabled={test == null || querying}
          >
            Run Tests
          </Button>
          <Button onClick={() => setTest(null)}>Clear</Button>
          <Switch onChange={(e) => setAll(e)} /> All
        </Space>
      </Paragraph>
      <Paragraph>
        <Row gutter={[10, 10]}>
          {Object.entries(USER_SELECTABLE_LLMS_BY_VENDOR).map(
            ([vendor, llms]) =>
              vendor !== "ollama" ? (
                <Col key={vendor} md={12} xs={24}>
                  <Title level={5}>{LLM_PROVIDER[vendor].name}</Title>
                  {llms
                    .filter(isCoreLanguageModel)
                    .map((llm) => renderStatus(llm, vendor as LLMServiceName))}
                </Col>
              ) : undefined,
          )}
          <Col key={"ollama"} md={12} xs={24}>
            <Title level={5}>Ollama</Title>
            {Object.entries(ollama?.toJS() ?? {}).map(([key, val]) => {
              const model = toOllamaModel(val.model);

              return (
                <Row
                  gutter={[10, 20]}
                  style={llmStyle(model)}
                  key={`ollama-${key}`}
                >
                  <Col md={24}>
                    <Space>
                      <Value val={true} /> <LLMModelName model={model} />
                    </Space>
                  </Col>
                  <Col md={24}>
                    <TestLLM
                      test={test}
                      model={model}
                      queryState={[querying, setQuerying]}
                    />
                  </Col>
                </Row>
              );
            })}
          </Col>
        </Row>
      </Paragraph>

      <Title level={5}>Ollama configuration</Title>
      <Value val={ollama} />
    </div>
  );
}

function Value({ val }: { val: any }) {
  switch (typeof val) {
    case "boolean":
      return val ? <Icon unicode={0x2705} /> : <Icon unicode={0x274c} />;
    case "number":
      return <>`${val}`</>;
    default:
      return <Text code>{JSON.stringify(val)}</Text>;
  }
}

interface TestLLMProps {
  model: CoreLanguageModel | string;
  test: number | null;
  queryState: [boolean | undefined, (val: boolean) => void];
}

function TestLLM({ model, test, queryState }: TestLLMProps) {
  const [querying, setQuerying] = queryState;
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [passed, setPassed] = useState<boolean | undefined>();

  const { prompt, expected } =
    typeof test === "number" ? PROMPTS[test] : { prompt: "", expected: "" };
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
      const llmStream = await webapp_client.openai_client.queryStream({
        input: prompt,
        project_id: null,
        tag: "admin-llm-test",
        model,
        system: "",
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
