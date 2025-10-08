import { Button, Space, Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { useState } from "react";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Convert({ actions }) {
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const convert = async (format) => {
    try {
      setError(null);
      setLoading(true);
      if (format == "ipynb") {
        await actions.convertToIpynb();
      } else {
        await actions.convertToMarkdown();
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="smc-vfill">
      <div style={{ textAlign: "center", marginTop: "45px", overflow: "auto" }}>
        <h3>Sage Worksheets are Deprecated</h3>
        <div style={{ color: "#666" }}>
          However, you can run the same code by converting your worksheet to a
          Jupyter notebook or a markdown file.
        </div>
        <div style={{ margin: "15px" }} />
        <Space>
          <Button
            disabled={loading}
            size="large"
            onClick={() => convert("ipynb")}
          >
            <Icon name="ipynb" />
            Convert to Jupyter Notebook
          </Button>
          <Button
            disabled={loading}
            size="large"
            onClick={() => convert("markdown")}
          >
            <Icon name="markdown" />
            Convert to Markdown
          </Button>
          {loading && <Spin />}
        </Space>
        <ShowError
          style={{ margin: "15px auto" }}
          error={error}
          setError={setError}
        />
        <hr />
        <StaticMarkdown
          value={actions.toMarkdown()}
          style={{
            textAlign: "left",
            margin: "30px auto",
            maxWidth: "900px",
            border: "1px solid #aaa",
            padding: "15px",
          }}
        />
      </div>
    </div>
  );
}
