import { Button } from "antd";

export default function Convert({}) {
  return (
    <div className="smc-vfill">
      <div style={{ textAlign: "center", marginTop: "45px" }}>
        <h3>Sage Worksheets are Deprecated</h3>
        <div style={{ margin: "15px" }} />
        <Button size="large" type="primary">
          Convert to Jupyter Notebook
        </Button>
      </div>
    </div>
  );
}
