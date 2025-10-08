import { Button, Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { useState } from "react";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

export default function Convert({ actions }) {
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const convert = async () => {
    try {
      setError(null);
      setLoading(true);
      await actions.convert();
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
        <div style={{ margin: "15px" }} />
        <Button
          disabled={loading}
          size="large"
          type="primary"
          onClick={() => convert()}
        >
          Convert to Jupyter Notebook {loading && <Spin />}
        </Button>
        <ShowError
          style={{ margin: "15px auto" }}
          error={error}
          setError={setError}
        />
        <hr />
        <StaticMarkdown
          value={"```sage\n# ---\n" + actions.getPlainText() + "\n```\n"}
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
