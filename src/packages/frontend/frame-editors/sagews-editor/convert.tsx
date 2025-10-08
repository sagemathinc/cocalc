import { Button } from "antd";

export default function Convert({ actions }) {
  return (
    <div className="smc-vfill">
      <div style={{ textAlign: "center", marginTop: "45px" }}>
        <h3>Sage Worksheets are Deprecated</h3>
        <div style={{ margin: "15px" }} />
        <Button size="large" type="primary">
          Convert to Jupyter Notebook
        </Button>
        <hr />
        <pre
          style={{
            textAlign: "left",
            margin: "30px auto",
            maxWidth: "900px",
            border: "1px solid #aaa",
            padding: "15px",
          }}
        >
          {actions._syncstring?.to_str()}
        </pre>
      </div>
    </div>
  );
}
