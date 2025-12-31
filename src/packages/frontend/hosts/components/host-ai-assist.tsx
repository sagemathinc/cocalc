import { Button, Card, Col, Input, Row, Select, Space, Typography, Alert } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { HostRecommendation } from "../types";
import { REGIONS } from "../constants";

type HostAiAssistProps = {
  aiQuestion: string;
  setAiQuestion: (value: string) => void;
  aiBudget?: number;
  setAiBudget: (value: number | undefined) => void;
  aiRegionGroup: string;
  setAiRegionGroup: (value: string) => void;
  aiLoading: boolean;
  aiError?: string;
  aiResults: HostRecommendation[];
  canRecommend: boolean;
  runAiRecommendation: () => void;
  applyRecommendation: (rec: HostRecommendation) => void;
};

export const HostAiAssist: React.FC<HostAiAssistProps> = ({
  aiQuestion,
  setAiQuestion,
  aiBudget,
  setAiBudget,
  aiRegionGroup,
  setAiRegionGroup,
  aiLoading,
  aiError,
  aiResults,
  canRecommend,
  runAiRecommendation,
  applyRecommendation,
}) => (
  <Card
    size="small"
    title={
      <Space>
        <span>AI Assist</span>
        <Typography.Text type="secondary">
          (beta)
        </Typography.Text>
      </Space>
    }
    style={{ marginBottom: 16 }}
  >
    <Space direction="vertical" style={{ width: "100%" }}>
      <Input.TextArea
        value={aiQuestion}
        onChange={(e) => setAiQuestion(e.target.value)}
        placeholder="Describe what you want to run and why (e.g., small GPU box for fine-tuning)."
        autoSize={{ minRows: 2, maxRows: 4 }}
      />
      <Row gutter={8}>
        <Col span={12}>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={aiBudget}
            onChange={(e) =>
              setAiBudget(e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder="Max $/hour (optional)"
          />
        </Col>
        <Col span={12}>
          <Select
            value={aiRegionGroup}
            onChange={setAiRegionGroup}
            options={[
              { value: "any", label: "Any region" },
              ...REGIONS,
            ]}
          />
        </Col>
      </Row>
      <Button
        onClick={runAiRecommendation}
        loading={aiLoading}
        disabled={!canRecommend}
      >
        Get recommendations
      </Button>
      {aiError && <Alert type="error" message={aiError} />}
      {aiResults.length > 0 && (
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          {aiResults.map((rec, idx) => (
            <Card
              key={`${rec.provider}-${rec.region}-${idx}`}
              size="small"
              bodyStyle={{ padding: "10px 12px" }}
            >
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Space align="start" style={{ justifyContent: "space-between" }}>
                  <div>
                    <Typography.Text strong>
                      {rec.title ?? `Option ${idx + 1}`}
                    </Typography.Text>
                    {rec.rationale && (
                      <div style={{ color: "#888" }}>{rec.rationale}</div>
                    )}
                  </div>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => applyRecommendation(rec)}
                  >
                    Apply
                  </Button>
                </Space>
                <Space direction="vertical" size={0}>
                  <Typography.Text type="secondary">
                    {rec.provider} · {rec.region ?? "any"}
                  </Typography.Text>
                  {rec.machine_type && (
                    <Typography.Text type="secondary">
                      {rec.machine_type}
                    </Typography.Text>
                  )}
                  {rec.flavor && (
                    <Typography.Text type="secondary">{rec.flavor}</Typography.Text>
                  )}
                  {rec.est_cost_per_hour != null && (
                    <Typography.Text type="secondary">
                      ~${rec.est_cost_per_hour}/hr
                    </Typography.Text>
                  )}
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      )}
    </Space>
  </Card>
);
