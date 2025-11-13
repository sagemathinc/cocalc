import {
  Alert,
  Button,
  Input,
  Progress,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";

import {
  redux,
  useAsyncEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, Paragraph, Title } from "@cocalc/frontend/components";
import { LLMModelName } from "@cocalc/frontend/components/llm-name";
import { Markdown } from "@cocalc/frontend/markdown";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  USER_SELECTABLE_LLMS_BY_VENDOR,
  isCoreLanguageModel,
  toCustomOpenAIModel,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import { trunc_middle } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PROMPTS } from "./tests";
import { Value } from "./value";
interface TestResult {
  model: string;
  status: "pending" | "running" | "passed" | "failed";
  output: string;
  error?: string;
  firstResponseTime?: number; // Time in milliseconds until first token
  totalTime?: number; // Total time in milliseconds until completion
}

export function TestLLMAdmin() {
  const customize = redux.getStore("customize");
  const globallyEnabledLLMs = customize.getEnabledLLMs();
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");
  const ollama = useTypedRedux("customize", "ollama");
  const custom_openai = useTypedRedux("customize", "custom_openai");
  const [test, setTest] = useState<number | null>(0);
  const [querying, setQuerying] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [currentTestIndex, setCurrentTestIndex] = useState<number>(0);

  // Initialize test results on component mount or when test changes
  useAsyncEffect(() => {
    if (test !== null) {
      const allModels = getAllModels();
      const initialResults: TestResult[] = allModels.map((model) => ({
        model,
        status: "pending",
        output: "",
      }));
      setTestResults(initialResults);
    } else {
      setTestResults([]);
    }
  }, [test, custom_openai, ollama, selectableLLMs]);

  function getAllModels(): string[] {
    const models: string[] = [];

    // Get core models
    Object.entries(USER_SELECTABLE_LLMS_BY_VENDOR).forEach(([vendor, llms]) => {
      if (vendor !== "ollama" && vendor !== "custom_openai") {
        llms.filter(isCoreLanguageModel).forEach((llm) => {
          models.push(llm);
        });
      }
    });

    // Get custom OpenAI models
    Object.entries(custom_openai?.toJS() ?? {}).forEach(([key, _val]) => {
      const model = toCustomOpenAIModel(key);
      models.push(model);
    });

    // Get Ollama models
    Object.entries(ollama?.toJS() ?? {}).forEach(([key, _val]) => {
      const model = toOllamaModel(key);
      models.push(model);
    });

    return models;
  }

  function getEnabledModels(): string[] {
    return getAllModels().filter((model) => {
      // Check if model is enabled in selectable LLMs
      if (isCoreLanguageModel(model)) {
        return selectableLLMs.includes(model);
      }
      // Custom OpenAI and Ollama models are always considered enabled if configured
      return true;
    });
  }

  async function runTestForModel(
    model: string,
    testConfig: any,
  ): Promise<TestResult> {
    const { prompt, expected, system, history } = testConfig;
    const expectedRegex = new RegExp(expected, "g");

    return new Promise((resolve) => {
      try {
        const startTime = Date.now();
        let firstResponseTime: number | undefined;
        let totalTime: number | undefined;

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
          console.log({ model, system, token });
          if (token != null) {
            // Record first response time if this is the first token
            if (firstResponseTime === undefined) {
              firstResponseTime = Date.now() - startTime;
            }
            reply += token;
            // Update the result in real-time
            setTestResults((prev) =>
              prev.map((r) =>
                r.model === model ? { ...r, output: reply } : r,
              ),
            );
          } else {
            // Stream is complete (token is null)
            totalTime = Date.now() - startTime;
            const passed = expectedRegex.test(reply);
            resolve({
              model,
              status: passed ? "passed" : "failed",
              output: reply,
              firstResponseTime,
              totalTime,
            });
          }
        });

        llmStream.on("error", (err) => {
          totalTime = Date.now() - startTime;
          console.error(`Error in LLM stream for model ${model}:`, err);
          resolve({
            model,
            status: "failed",
            output: reply,
            error: err?.toString(),
            firstResponseTime,
            totalTime,
          });
        });

        // Start the stream
        llmStream.emit("start");
      } catch (err) {
        console.error(`Error running test for model ${model}:`, err);
        resolve({
          model,
          status: "failed",
          output: "",
          error: err?.toString(),
        });
      }
    });
  }

  async function runSingleTest(model: string) {
    if (test === null) return;

    const testConfig = PROMPTS[test];

    // Find the model in the results and update its status
    const modelIndex = testResults.findIndex((r) => r.model === model);
    if (modelIndex === -1) return;

    setCurrentTestIndex(modelIndex);

    // Update status to running
    setTestResults((prev) =>
      prev.map((r, idx) =>
        idx === modelIndex
          ? { ...r, status: "running", output: "", error: undefined }
          : r,
      ),
    );

    const result = await runTestForModel(model, testConfig);

    // Update with final result
    setTestResults((prev) =>
      prev.map((r, idx) => (idx === modelIndex ? result : r)),
    );
  }

  async function runSequentialTests() {
    if (test === null) return;

    const models = getEnabledModels();
    const testConfig = PROMPTS[test];

    // Initialize results
    const initialResults: TestResult[] = models.map((model) => ({
      model,
      status: "pending",
      output: "",
    }));

    setTestResults(initialResults);
    setQuerying(true);
    setCurrentTestIndex(0);

    // Run tests sequentially
    for (let i = 0; i < models.length; i++) {
      setCurrentTestIndex(i);

      // Update status to running
      setTestResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r)),
      );

      const result = await runTestForModel(models[i], testConfig);

      // Update with final result
      setTestResults((prev) => prev.map((r, idx) => (idx === i ? result : r)));

      // Add delay between tests to avoid rate limiting
      if (i < models.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    setQuerying(false);
  }

  function renderTestResultIcon(status: TestResult["status"]) {
    switch (status) {
      case "pending":
        return <Icon unicode={0x2753} />;
      case "running":
        return <Loading text="" />;
      case "passed":
        return <Value val={true} />;
      case "failed":
        return <Value val={false} />;
      default:
        return <Icon unicode={0x2753} />;
    }
  }

  function formatTiming(timeMs: number | undefined): string {
    if (timeMs === undefined) return "-";
    return `${(timeMs / 1000).toFixed(1)}s`;
  }

  function renderTimingColumn(record: TestResult) {
    const { firstResponseTime, totalTime, status } = record;

    if (status === "pending" || status === "running") {
      return <span style={{ color: COLORS.GRAY_M }}>-</span>;
    }

    if (firstResponseTime === undefined || totalTime === undefined) {
      return <span style={{ color: COLORS.GRAY_M }}>-</span>;
    }

    // Calculate progress bar values (normalize to 10 seconds max)
    const maxTime = Math.max(
      10000,
      ...testResults.filter((r) => r.totalTime).map((r) => r.totalTime!),
    );
    const totalPercent = Math.min(100, (totalTime / maxTime) * 100);

    // Determine if this is one of the slowest (top 10% quantile)
    const completedResults = testResults.filter(
      (r) => r.totalTime !== undefined,
    );
    const sortedTimes = completedResults
      .map((r) => r.totalTime!)
      .sort((a, b) => b - a);
    const slowThreshold =
      sortedTimes[Math.floor(sortedTimes.length * 0.1)] || 0;
    const isSlow = totalTime >= slowThreshold && completedResults.length > 1;

    return (
      <div>
        <Tooltip title="First response time / Total completion time">
          <div style={{ marginBottom: 2 }}>
            {formatTiming(firstResponseTime)}/{formatTiming(totalTime)}
          </div>
        </Tooltip>
        <Progress
          percent={totalPercent}
          size="small"
          status={isSlow ? "exception" : "normal"}
          showInfo={false}
        />
      </div>
    );
  }

  function renderTestResults() {
    if (testResults.length === 0) {
      return (
        <Paragraph>
          Click "Run Tests" to execute the selected test on all enabled models.
        </Paragraph>
      );
    }

    const columns = [
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 80,
        render: (status: TestResult["status"]) => renderTestResultIcon(status),
      },
      {
        title: "Model",
        dataIndex: "model",
        key: "model",
        width: 180,
        render: (model: string /*, record: TestResult*/) => (
          <Space>
            <LLMModelName model={model} />
            {/* {record.status === "running" && <span>(Running...)</span>} */}
          </Space>
        ),
      },
      {
        title: "Output",
        dataIndex: "output",
        key: "output",
        render: (output: string) =>
          output ? (
            <Markdown value={output} />
          ) : (
            <span style={{ color: COLORS.GRAY_M }}>-</span>
          ),
      },
      {
        title: "Error",
        dataIndex: "error",
        key: "error",
        render: (error: string) =>
          error ? (
            <Alert type="error" banner message={error} style={{ margin: 0 }} />
          ) : (
            <span style={{ color: COLORS.GRAY_M }}>-</span>
          ),
      },
      {
        title: "Timing",
        key: "timing",
        width: 120,
        render: (_, record: TestResult) => renderTimingColumn(record),
      },
      {
        title: "Test",
        key: "test",
        width: 80,
        render: (_, record: TestResult) => {
          const isEnabled = getEnabledModels().includes(record.model);
          const isRunning = record.status === "running";
          const isQuerying = querying && record.status === "running";

          return (
            <Button
              type="primary"
              size="small"
              disabled={test === null || !isEnabled || isQuerying}
              loading={isRunning}
              onClick={() => runSingleTest(record.model)}
              style={{ width: "60px" }}
            >
              {isRunning ? "" : "Run"}
            </Button>
          );
        },
      },
    ];

    const dataSource = testResults.map((result, index) => ({
      ...result,
      key: result.model,
      // Add row styling for currently running test
      className:
        index === currentTestIndex && querying ? "running-row" : undefined,
    }));

    return (
      <div>
        <Title level={4}>Test Results</Title>
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={false}
          size="small"
          rowClassName={(_, index) =>
            index === currentTestIndex && querying
              ? "admin-llm-test-running-row"
              : ""
          }
          style={{ marginTop: "10px" }}
        />
      </div>
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
            onClick={runSequentialTests}
            disabled={test == null || querying}
          >
            Run Tests
          </Button>
          <Button
            onClick={() => {
              setTest(null);
              setTestResults([]);
            }}
          >
            Clear
          </Button>
        </Space>
      </Paragraph>

      {renderTestResults()}

      <Title level={5}>Ollama configuration</Title>
      <Value val={ollama} />
      <Title level={5}>Custom OpenAI API</Title>
      <Value val={custom_openai} />
    </div>
  );
}
