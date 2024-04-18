import { Alert, Button, Col, Input, Row, Select, Space } from "antd";

import {
  CSS,
  redux,
  useAsyncEffect,
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
} from "@cocalc/util/db-schema/llm-utils";
import { getRandomColor } from "@cocalc/util/misc";

const DEFAULT_PROMPT = "What's 9 + 91? Number only please!";
const PROMPT_2 = "LaTeX Formula for 'd f(x) / dx = f(x sin(x)'";

export function TestLLMAdmin() {
  const customize = redux.getStore("customize");
  const globallyEnabledLLMs = customize.getEnabledLLMs();
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");
  const ollama = useTypedRedux("customize", "ollama");
  const [test, setTest] = useState<string>(DEFAULT_PROMPT);
  const [querying, setQuerying] = useState<boolean>();

  function renderStatus(llm: CoreLanguageModel, vendor: LLMServiceName) {
    const enabled = selectableLLMs.includes(llm);
    const style: CSS = {
      marginLeft: "5px",
      marginBottom: "5px",
      borderLeft: `5px solid ${getRandomColor(llm, {
        min: 100,
        max: 250,
        diff: 100,
      })}`,
    };
    return (
      <Row gutter={[10, 20]} style={style} key={`${vendor}-${llm}`}>
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
        <Value val={globallyEnabledLLMs} />
      </Paragraph>
      <Paragraph>
        <Space>
          <Input
            value={test}
            disabled={querying}
            onChange={(e) => setTest(e.target.value)}
            placeholder="Enter a query..."
            addonAfter={
              <Select onSelect={setTest} defaultValue={DEFAULT_PROMPT}>
                <Select.Option value={DEFAULT_PROMPT}>calc</Select.Option>
                <Select.Option value={PROMPT_2}>formula</Select.Option>
              </Select>
            }
          />
          <Button
            type="primary"
            onClick={() => setQuerying(true)}
            disabled={querying}
          >
            Run Tests
          </Button>
          <Button onClick={() => setTest("")}>Clear</Button>
        </Space>
      </Paragraph>
      <Paragraph>
        <Row gutter={[10, 10]}>
          {Object.entries(USER_SELECTABLE_LLMS_BY_VENDOR).map(
            ([vendor, llms]) => (
              <Col key={vendor} md={12} xs={24}>
                <Title level={5}>{LLM_PROVIDER[vendor].name}</Title>
                {llms
                  .filter(isCoreLanguageModel)
                  .map((llm) => renderStatus(llm, vendor as LLMServiceName))}
              </Col>
            ),
          )}
        </Row>
      </Paragraph>
      <Paragraph>
        Ollama: <Value val={ollama} />
      </Paragraph>
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
  model: CoreLanguageModel;
  test: string;
  queryState: [boolean | undefined, (val: boolean) => void];
}

function TestLLM({ model, test, queryState }: TestLLMProps) {
  const [querying, setQuerying] = queryState;
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");

  useAsyncEffect(async () => {
    if (!querying || !test.trim()) {
      querying && setQuerying(false);
      setError("");
      return;
    }

    try {
      const llmStream = await webapp_client.openai_client.queryStream({
        input: test,
        project_id: null,
        tag: "admin-llm-test",
        model,
        system: "",
      });

      let reply = "";
      llmStream.on("token", (token) => {
        if (token) {
          reply += token;
          setOutput(reply);
        }
      });

      llmStream.on("error", (err) => {
        setError(err?.toString());
        setQuerying(false);
      });
    } catch (err) {
      setError(err?.toString());
    } finally {
      setQuerying(false);
    }
  }, [querying]);

  if (querying) {
    return <Loading />;
  }

  return (
    <>
      <Markdown value={output} />
      {error ? <Alert banner type="error" message={error} /> : undefined}
    </>
  );
}
