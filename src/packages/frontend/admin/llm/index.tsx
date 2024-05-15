import { Button, Col, Input, Row, Select, Space, Switch } from "antd";

import {
  CSS,
  redux,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Paragraph, Title } from "@cocalc/frontend/components";
import { LLMModelName } from "@cocalc/frontend/components/llm-name";
import {
  LanguageModelCore,
  LLMServiceName,
  LLM_PROVIDER,
  USER_SELECTABLE_LLMS_BY_VENDOR,
  isCoreLanguageModel,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import { getRandomColor, trunc_middle } from "@cocalc/util/misc";
import { TestLLM } from "./test-component";
import { PROMPTS } from "./tests";
import { Value } from "./value";

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

  function renderStatus(llm: LanguageModelCore, vendor: LLMServiceName) {
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
                {PROMPTS.map((p, i) => (
                  <Select.Option key={i} value={i}>
                    {trunc_middle(p.prompt, 25)}
                  </Select.Option>
                ))}
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
