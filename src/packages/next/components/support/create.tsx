import { Alert, Button, Space, Input, Layout, Radio } from "antd";
import { useRef, useState } from "react";
import A from "components/misc/A";
import useDatabase from "lib/hooks/database";
import Loading from "components/share/loading";

function VSpace({ children }) {
  return (
    <Space direction="vertical" style={{ width: "100%", fontSize: "12pt" }}>
      {children}
    </Space>
  );
}

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
          <VSpace>
            <Email />
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
              <VSpace>
                <Radio value={"bug"}>
                  <b>Bug report: </b> something is not working the way I think
                  it should work.
                </Radio>
                <Radio value={"question"}>
                  <b>Question:</b> I have a question about billing,
                  functionality, teaching, etc.
                </Radio>
              </VSpace>
            </Radio.Group>
            <br />
            <Files />
            {type == "bug" ? <Bug /> : <Question />}
          </VSpace>
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
    <VSpace>
      <b>Files</b>
      Click the checkbox next to any files that are relevant. This will make it
      vastly easier for us to quickly understand your problem.
      <pre>...list of files here...</pre>
      If any relevant files aren't listed here, please include their URL below
      (e.g., copy and paste from the address bar).
    </VSpace>
  );
}

function Bug() {
  return (
    <VSpace>
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
    </VSpace>
  );
}

function Question() {
  return (
    <VSpace>
      <b>Your Question</b>
      <Input.TextArea rows={6} placeholder="Your question..." />
    </VSpace>
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
        message={"FAQ"}
        style={{ margin: "20px 30px" }}
        type="warning"
        description={
          <ul style={{ marginBottom: 0 }}>
            <li>
              {" "}
              <A href="https://doc.cocalc.com/howto/missing-project.html">
                File or project is gone?
              </A>{" "}
            </li>
            <li>
              {" "}
              Jupyter notebook or SageMath worksheet{" "}
              <A href="https://doc.cocalc.com/howto/slow-worksheet.html">
                slow
              </A>{" "}
              or{" "}
              <A href="https://doc.cocalc.com/howto/jupyter-kernel-terminated.html">
                crashing
              </A>
              ?{" "}
            </li>
            <li>
              {" "}
              <A href="https://doc.cocalc.com/howto/sage-question.html">
                Questions about SageMath?
              </A>
            </li>
            <li>
              Just want to quickly chat? Visit the{" "}
              <A href="https://discord.gg/nEHs2GK">CoCalc Discord server</A>.
            </li>
          </ul>
        }
      />
    </div>
  );
}

function Email() {
  const { loading, value } = useDatabase({ accounts: { email_address: null } });
  return (
    <VSpace>
      <b>Email address</b>
      {loading ? (
        <Loading />
      ) : (
        <Input
          defaultValue={value.accounts?.email_address}
          placeholder="Email address..."
          style={{ maxWidth: "500px" }}
        />
      )}
    </VSpace>
  );
}
