import { Button, Col, Row } from "antd";

import {
  redux,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, Title } from "@cocalc/frontend/components";
import { LLMModelName } from "@cocalc/frontend/components/llm-name";
import {
  LLMServiceName,
  LLM_PROVIDER,
  LanguageModel,
  USER_SELECTABLE_LLMS_BY_VENDOR,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";

export function TestLLMAdmin() {
  const customize = redux.getStore("customize");
  const globallyEnabledLLMs = customize.getEnabledLLMs();
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");
  const ollama = useTypedRedux("customize", "ollama");
  const [test, setTest] = useState<string>("");

  useEffect(() => {
    console.log(`Trigger test: ${test}`);
  }, [test]);

  function renderStatus(vendor: LLMServiceName, llm: LanguageModel) {
    const matchVendor = model2vendor(llm) === vendor;
    const enabled = selectableLLMs.includes(llm);
    return (
      <Row gutter={[10, 20]}>
        <Col md={4}>
          <LLMModelName model={llm} />
        </Col>
        <Col md={3}>
          <Value val={enabled} /> enabled
        </Col>
        <Col md={3}>
          <Value val={matchVendor} /> vendor check
        </Col>
      </Row>
    );
  }

  return (
    <div>
      <Title level={4}>LLM Testing</Title>
      <Paragraph>
        Globally enabled LLMs (Admin Settings):{" "}
        <Value val={globallyEnabledLLMs} />
      </Paragraph>
      <Paragraph>
        <Button onClick={() => setTest("What's 9 + 91?")}>Test</Button>
      </Paragraph>
      <Paragraph>
        {Object.entries(USER_SELECTABLE_LLMS_BY_VENDOR).map(
          ([vendor, llms]) => (
            <>
              <Row gutter={[10, 10]}>
                <Col md={24}>
                  <Title level={5}>{LLM_PROVIDER[vendor].name}</Title>
                </Col>
              </Row>
              {llms.map((llm) => renderStatus(vendor as LLMServiceName, llm))}
            </>
          ),
        )}
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
      return <>{JSON.stringify(val)}</>;
  }
}
