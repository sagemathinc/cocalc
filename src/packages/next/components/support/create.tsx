import { Alert, Button, Divider, Space, Input, Layout, Radio } from "antd";
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
import { NoZendesk } from "./util";
import { Type } from "./tickets";

function VSpace({ children }) {
  return (
    <Space direction="vertical" style={{ width: "100%", fontSize: "12pt" }}>
      {children}
    </Space>
  );
}

export default function Create() {
  const { contactEmail, zendesk } = useCustomize();
  const router = useRouter();
  // The URL the user was viewing when they requested support.
  // This could easily be blank, but if it is set it can be useful.
  const { url } = router.query;
  const [files, setFiles] = useState<{ project_id: string; path?: string }[]>(
    []
  );
  const [type, setType] = useState<string>("problem");
  const [email, setEmail] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [subject, setSubject] = useState<string>("");

  const [submitError, setSubmitError] = useState<ReactNode>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<ReactNode>("");

  const submittable = useRef<boolean>(false);
  submittable.current = !!(
    !submitting &&
    !submitError &&
    !success &&
    isValidEmailAddress(email) &&
    subject &&
    body
  );

  if (!zendesk) {
    return <NoZendesk />;
  }

  async function createSupportTicket() {
    const info = getBrowserInfo();
    const options = { type, files, email, body, url, subject, info };
    setSubmitError("");
    let result;
    try {
      setSubmitting(true);
      result = await apiPost("/support/create-ticket", { options });
    } catch (err) {
      result = { error: `${err}` };
    } finally {
      setSubmitting(false);
    }
    if (result.error) {
      setSubmitError(result.error);
    } else {
      setSuccess(
        <div>
          <p>
            Please save this URL: <A href={result.url}>{result.url}</A>
          </p>
          <p>
            You can also see the{" "}
            <A href="/support/tickets">status of your support tickets</A>.
          </p>
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
        <h1>Create Your Ticket</h1>
        <Instructions />
        <Divider>Support Ticket</Divider>
        <form>
          <VSpace>
            <b>
              <Status done={isValidEmailAddress(email)} /> Your Email Address
            </b>
            <Email onChange={setEmail} />
            <br />
            <b>
              <Status done={subject} /> Subject
            </b>
            <Input
              placeholder="Summarize what this ticket is about..."
              onChange={(e) => setSubject(e.target.value)}
            />
            <br />
            <b>
              Is this a <i>Problem</i> or a <i>Question</i>?
            </b>
            <Radio.Group
              name="radiogroup"
              defaultValue={"problem"}
              onChange={(e) => setType(e.target.value)}
            >
              <VSpace>
                <Radio value={"problem"}>
                  <Type type="problem" /> Something is not working the way I
                  think it should work.
                </Radio>
                <Radio value={"question"}>
                  <Type type="question" /> I have a question about billing,
                  functionality, teaching, etc.
                </Radio>
              </VSpace>
            </Radio.Group>
            <br />
            <Files onChange={setFiles} />
            <br />
            <b>
              <Status done={body && body.length > 10} /> Description
            </b>
            <div
              style={{
                marginLeft: "30px",
                borderLeft: "1px solid lightgrey",
                paddingLeft: "15px",
              }}
            >
              {type == "problem" ? (
                <Problem onChange={setBody} />
              ) : (
                <Question onChange={setBody} />
              )}
            </div>
          </VSpace>
          <p style={{ marginTop: "30px" }}>
            After submitting this ticket, you'll receive a link, which you
            should save until you receive a confirmation email. You can also{" "}
            <A href="/support/tickets">
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
              {submitting
                ? "Submitting..."
                : success
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
            {submitting && <Loading style={{ fontSize: "32pt" }} />}
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
      Select any relevant projects and files below. This will make it much
      easier for us to quickly understand your problem.
      <RecentFiles interval="1 day" onChange={onChange} />
    </VSpace>
  );
}

function Problem({ onChange }) {
  const answers = useRef<[string, string, string]>(["", "", ""]);
  function update(i: 0 | 1 | 2, value: string): void {
    answers.current[i] = value;
    onChange?.(answers.current.join("\n\n\n").trim());
  }

  return (
    <VSpace>
      <b>What did you do exactly?</b>
      <Input.TextArea
        rows={3}
        placeholder="Describe what you did..."
        onChange={(e) =>
          update(
            0,
            e.target.value
              ? "\n\n1. What did you do exactly?\n\n" + e.target.value
              : ""
          )
        }
      />
      <br />
      <b>What happened?</b>
      <Input.TextArea
        rows={3}
        placeholder="Tell us what happened..."
        onChange={(e) =>
          update(
            1,
            e.target.value ? "\n\n2. What happened?\n\n" + e.target.value : ""
          )
        }
      />
      <br />
      <b>How did this differ from what you expected?</b>
      <Input.TextArea
        rows={4}
        placeholder="Explain how this differs from what you expected..."
        onChange={(e) =>
          update(
            2,
            e.target.value
              ? "\n\n3. How did this differ from what you expected?\n\n" +
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
    <Input.TextArea
      rows={6}
      placeholder="Your question..."
      onChange={(e) => onChange(e.target.value)}
    />
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
              I have{" "}
              <A href="https://doc.cocalc.com/howto/sage-question.html">
                questions about SageMath.
              </A>
            </li>
            <li>
              I just need to{" "}
              <A href="https://discord.gg/nEHs2GK">quickly chat</A>.
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

function Status({ done }) {
  return (
    <Icon
      style={{
        color: done ? "green" : "red",
        fontWeight: "bold",
        fontSize: "12pt",
      }}
      name={done ? "check" : "arrow-right"}
    />
  );
}
