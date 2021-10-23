import { Alert, Button, Space, Input, Layout, Radio } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { ReactNode, useEffect, useRef, useState } from "react";
import A from "components/misc/A";
import useDatabase from "lib/hooks/database";
import Loading from "components/share/loading";
import RecentFiles from "./recent-files";
import { useRouter } from "next/router";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import apiPost from "lib/api/post";
import getBrowserInfo from "./browser-info";
import { useCustomize } from "lib/customize";

function VSpace({ children }) {
  return (
    <Space direction="vertical" style={{ width: "100%", fontSize: "12pt" }}>
      {children}
    </Space>
  );
}

export default function Create() {
  const { contactEmail } = useCustomize();
  const router = useRouter();
  // The URL the user was viewing when they requested support.
  // This could easily be blank, but if it is set it can be useful.
  const { url } = router.query;
  const [files, setFiles] = useState<{ project_id: string; path?: string }[]>(
    []
  );
  const [type, setType] = useState<string>("bug");
  const [email, setEmail] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [subject, setSubject] = useState<string>("");

  const [submitError, setSubmitError] = useState<ReactNode>("");
  const [success, setSuccess] = useState<ReactNode>("");

  const submittable = useRef<boolean>(false);
  submittable.current = !!(isValidEmailAddress(email) && subject && body);

  async function createSupportTicket() {
    const info = getBrowserInfo();
    const options = { type, files, email, body, url, subject, info };
    setSubmitError("");
    let result;
    try {
      result = await apiPost("/support/create-ticket", { options });
    } catch (err) {
      result = { error: `${err}` };
    }
    if (result.error) {
      setSubmitError(result.error);
    } else {
      setSuccess(
        <div>
          Please save this URL: <A href={result.url}>{result.url}</A>
        </div>
      );
    }
  }

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
          color: "#555",
        }}
      >
        {" "}
        <h1 style={{ textAlign: "center", fontSize: "24pt" }}>
          Create a New Support Ticket
        </h1>
        <p style={{ fontSize: "12pt" }}>
          Create a new support ticket below or{" "}
          <A href="/support/tickets">
            check the status of your support tickets
          </A>
          .{" "}
          {contactEmail && (
            <>
              You can also email us directly at{" "}
              <A href={`mailto:${contactEmail}`}>{contactEmail}</A>.
            </>
          )}
        </p>
        <FAQ />
        <h2>Create Your Ticket</h2>
        <Instructions />
        <form>
          <VSpace>
            <Email onChange={setEmail} />
            <br />
            <b>Subject</b>
            <Input
              placeholder="Summarize what's happening..."
              onChange={(e) => setSubject(e.target.value)}
            />
            <br />
            <b>
              Is this a <i>Bug Report</i> or a <i>Question</i>?
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
            <Files onChange={setFiles} />
            <br />
            {type == "bug" ? (
              <Bug onChange={setBody} />
            ) : (
              <Question onChange={setBody} />
            )}
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
              onClick={createSupportTicket}
            >
              <Icon name="paper-plane" />{" "}
              {success
                ? "Thank you for creating a ticket"
                : submitError
                ? "Close the error box to try again"
                : !isValidEmailAddress(email)
                ? "Enter Valid Email Address above"
                : !subject
                ? "Enter Subject above"
                : !body
                ? "Describe your issue above"
                : "Create Support Ticket"}
            </Button>
            {submitError && (
              <div>
                <Alert
                  type="error"
                  message="Error creating support ticket"
                  description={submitError}
                  closable
                  showIcon
                  onClose={() => setSubmitError("")}
                  style={{ margin: "15px auto", maxWidth: "500px" }}
                />
                <br />
                {contactEmail && (
                  <>
                    If you continue to have problems, email us directly at{" "}
                    <A href={`mailto:${contactEmail}`}>{contactEmail}</A>.
                  </>
                )}
              </div>
            )}
            {success && (
              <Alert
                type="success"
                message="Successfully created support ticket"
                description={success}
                onClose={() => {
                  // simplest way to reset all the information in the form.
                  router.reload();
                }}
                closable
                showIcon
                style={{ margin: "15px auto", maxWidth: "500px" }}
              />
            )}
          </div>
        </form>
      </div>
    </Layout.Content>
  );
}

function Files({ onChange }) {
  return (
    <VSpace>
      <b>Relevant Files</b>
      Select any relevant files below. This will make it much easier for us to
      quickly understand your problem. If a file isn't listed, please include
      their URL below (e.g., copy and paste from the address bar).
      <RecentFiles interval="1 day" onChange={onChange} />
    </VSpace>
  );
}

function Bug({ onChange }) {
  const answers = useRef<[string, string, string]>(["", "", ""]);
  function update(i: 0 | 1 | 2, value: string): void {
    answers.current[i] = value;
    onChange?.(answers.current.join("\n\n\n").trim());
  }

  return (
    <VSpace>
      <b>1. What did you do exactly?</b>
      <Input.TextArea
        rows={3}
        placeholder="Describe what you did..."
        onChange={(e) =>
          update(
            0,
            e.target.value
              ? "**1. What did you do exactly?**\n\n" + e.target.value
              : ""
          )
        }
      />
      <br />
      <b>2. What happened?</b>
      <Input.TextArea
        rows={3}
        placeholder="Tell us what happened..."
        onChange={(e) =>
          update(
            1,
            e.target.value ? "**2. What happened?**\n\n" + e.target.value : ""
          )
        }
      />
      <br />
      <b>3. How did this differ from what you expected?</b>
      <Input.TextArea
        rows={4}
        placeholder="Explain how this differs from what you expected..."
        onChange={(e) =>
          update(
            2,
            e.target.value
              ? "**3. How did this differ from what you expected?**\n\n" +
                  e.target.value
              : ""
          )
        }
      />
    </VSpace>
  );
}

function Question({ onChange }) {
  return (
    <VSpace>
      <b>Your Question</b>
      <Input.TextArea
        rows={6}
        placeholder="Your question..."
        onChange={(e) => onChange(e.target.value)}
      />
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
      Check the frequent questions first:
      <Alert
        message={""}
        style={{ margin: "20px 30px" }}
        type="warning"
        description={
          <ul style={{ marginBottom: 0, fontSize: "11pt" }}>
            <li>
              {" "}
              <A href="https://doc.cocalc.com/howto/missing-project.html">
                My file or project is gone?
              </A>{" "}
            </li>
            <li>
              {" "}
              My Jupyter notebook or SageMath worksheet is{" "}
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
                I have questions about SageMath.
              </A>
            </li>
            <li>
              I need to quickly chat. Visit the{" "}
              <A href="https://discord.gg/nEHs2GK">CoCalc Discord server</A>.
            </li>
          </ul>
        }
      />
    </div>
  );
}

function Email({ onChange }) {
  const { loading, value } = useDatabase({ accounts: { email_address: null } });
  useEffect(() => {
    onChange(value.accounts?.email_address);
  }, [value]);

  return (
    <VSpace>
      <b>Email Address</b>
      {loading ? (
        <Loading />
      ) : (
        <Input
          prefix={<Icon name="envelope" style={{ color: "rgba(0,0,0,.25)" }} />}
          defaultValue={value.accounts?.email_address}
          placeholder="Email address..."
          style={{ maxWidth: "500px" }}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </VSpace>
  );
}
