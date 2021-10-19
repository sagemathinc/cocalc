import { Alert, Button, Space, Input, Layout, Radio } from "antd";
import { useRef, useState } from "react";
import A from "components/misc/A";

export default function Create() {
  const [type, setType] = useState<string>("bug");
  const submittable = useRef<boolean>(false);

  submittable.current = true;

  return (
    <Layout.Content
      style={{
        backgroundColor: "white",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "15px auto",
          padding: "15px",
          backgroundColor: "white",
        }}
      >
        {" "}
        <h1 style={{ textAlign: "center", fontSize: "24pt" }}>
          Create Support Ticket
        </h1>
        <FAQ />
        <h2>Create Your Ticket</h2>
        <Instructions />
        <form>
          <Space
            direction="vertical"
            style={{ width: "100%", fontSize: "12pt" }}
          >
            <b>Email address</b>
            <Input
              placeholder="Email address..."
              style={{ maxWidth: "500px" }}
            />
            <br />
            <b>Summary</b>
            <Input placeholder="Short summary..." />
            <br />
            <b>
              Is this a <i>bug report</i> or a <i>question</i>?
            </b>
            <Radio.Group
              name="radiogroup"
              defaultValue={"bug"}
              onChange={(e) => setType(e.target.value)}
            >
              <Space direction="vertical">
                <Radio value={"bug"}>
                  <b>Bug report: </b> something is not working the way I think
                  it should work.
                </Radio>
                <Radio value={"question"}>
                  <b>Question:</b> I have a question about billing,
                  functionality, teaching, etc.
                </Radio>
              </Space>
            </Radio.Group>
            <br />
            <Files />
            {type == "bug" ? <Bug /> : <Question />}
          </Space>
          <p style={{ marginTop: "30px" }}>
            After submitting this ticket, you'll receive a link, which you
            should save until you receive a confirmation email. You can also{" "}
            <A href="/support/status">
              check the status of your support tickets
            </A>
            .
          </p>

          <div style={{ textAlign: "center", marginTop: "30px" }}>
            <Button
              shape="round"
              size="large"
              disabled={!submittable.current}
              type="primary"
            >
              Create Support Ticket
            </Button>
          </div>
        </form>
      </div>
    </Layout.Content>
  );
}

function Files() {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <b>Files</b>
      Click the checkbox next to any files that are relevant. This will make it
      easy for us to more quickly debug your problem.
      <pre>...list of files here...</pre>
      If any relevant files aren't listed here, please include their URL below
      (e.g., copy and paste from the address bar).
    </Space>
  );
}

function Bug() {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <b>1. What did you do exactly?</b>
      <Input.TextArea rows={3} placeholder="1. What did you do exactly?" />
      <br />
      <b>2. What happened?</b>
      <Input.TextArea rows={3} placeholder="2. What happened?" />
      <br />
      <b>3. How did this differ from what you expected?</b>
      <Input.TextArea
        rows={3}
        placeholder="3. How did this differ from what you expected?"
      />
    </Space>
  );
}

function Question() {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <b>Your Question</b>
      <Input.TextArea rows={6} placeholder="Your question..." />
    </Space>
  );
}

function Instructions() {
  return (
    <div>
      <p>
        If you still need help, create a support ticket below. Support is
        currently available in <b>English and German</b> only.
      </p>
    </div>
  );
}

function FAQ() {
  return (
    <div>
      {" "}
      <h2>Frequently Asked Questions</h2>
      Check through this list of very frequent questions first:
      <Alert
        style={{ margin: "20px 30px" }}
        type="warning"
        description={
          <ul style={{ marginBottom: 0 }}>
            <li> File or project or account gone? </li>
            <li> Jupyter notebook or SageMath worksheet slow or crashing? </li>
            <li> Questions about SageMath?</li>
            <li>
              Just want to quickly chat? Visit the CoCalc Discord server!{" "}
            </li>
          </ul>
        }
      />
    </div>
  );
}
