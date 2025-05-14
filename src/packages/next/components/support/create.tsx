import {
  Alert,
  Button,
  Divider,
  Input,
  Layout,
  Modal,
  Radio,
  Space,
} from "antd";
import { useRouter } from "next/router";
import { ReactNode, useRef, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import ChatGPTHelp from "components/openai/chatgpt-help";
import CodeMirror from "components/share/codemirror";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import { VideoItem } from "components/videos";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { useCustomize } from "lib/customize";
import getBrowserInfo from "./browser-info";
import RecentFiles from "./recent-files";
import { Type } from "./tickets";
import { NoZendesk } from "./util";

const CHATGPT_DISABLED = true;
const MIN_BODY_LENGTH = 16;

function VSpace({ children }) {
  return (
    <Space direction="vertical" style={{ width: "100%", fontSize: "12pt" }}>
      {children}
    </Space>
  );
}

export type Type = "problem" | "question" | "task" | "purchase" | "chat";

function stringToType(s?: any): Type {
  if (
    s === "problem" ||
    s === "question" ||
    s === "task" ||
    s === "purchase" ||
    s === "chat"
  )
    return s;
  return "problem"; // default;
}

export default function Create() {
  const {
    account,
    onCoCalcCom,
    helpEmail,
    openaiEnabled,
    siteName,
    zendesk,
    supportVideoCall,
  } = useCustomize();
  const router = useRouter();
  // The URL the user was viewing when they requested support.
  // This could easily be blank, but if it is set it can be useful.
  const { url } = router.query;
  const [files, setFiles] = useState<{ project_id: string; path?: string }[]>(
    [],
  );
  const [type, setType] = useState<Type>(stringToType(router.query.type));
  const [email, setEmail] = useState<string>(account?.email_address ?? "");
  const [body, setBody] = useState<string>(
    router.query.body ? `${router.query.body}` : "",
  );
  const required = router.query.required ? `${router.query.required}` : "";
  const [subject, setSubject] = useState<string>(
    router.query.subject ? `${router.query.subject}` : "",
  );

  const [submitError, setSubmitError] = useState<ReactNode>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<ReactNode>("");

  const showExtra = router.query.hideExtra != "true";

  // hasRequired means "has the required information", which
  // means that body does NOT have required in it!
  const hasRequired = !required || !body.includes(required);

  const submittable = useRef<boolean>(false);
  submittable.current = !!(
    !submitting &&
    !submitError &&
    !success &&
    isValidEmailAddress(email) &&
    subject &&
    (body ?? "").length >= MIN_BODY_LENGTH &&
    hasRequired
  );

  if (!zendesk) {
    return <NoZendesk />;
  }

  async function createSupportTicket() {
    const info = getBrowserInfo();
    if (router.query.context) {
      // used to pass context info along in the url when
      // creating a support ticket,
      // e.g., from the crash reporter.
      info.context = `${router.query.context}`;
    }
    const options = { type, files, email, body, url, subject, info };
    setSubmitError("");
    let result;
    try {
      setSubmitting(true);
      result = await apiPost("/support/create-ticket", { options });
    } catch (err) {
      setSubmitError(err.message);
      return;
    } finally {
      setSubmitting(false);
    }
    setSuccess(
      <div>
        <p>
          Please save this URL: <A href={result.url}>{result.url}</A>
        </p>
        <p>
          You can also see the{" "}
          <A href="/support/tickets">status of your support tickets</A>.
        </p>
      </div>,
    );
  }

  function renderChat() {
    if (type === "chat" && supportVideoCall) {
      return (
        <h1 style={{ textAlign: "center" }}>
          <b>
            <A href={supportVideoCall}>Book a Video Chat...</A>
          </b>
        </h1>
      );
    }
    if (type !== "chat") {
      return (
        <>
          <b>
            <Status
              done={body && body.length >= MIN_BODY_LENGTH && hasRequired}
            />{" "}
            Description
          </b>
          <div
            style={{
              marginLeft: "30px",
              borderLeft: "1px solid lightgrey",
              paddingLeft: "15px",
            }}
          >
            {type == "problem" && <Problem onChange={setBody} />}
            {type == "question" && (
              <Question onChange={setBody} defaultValue={body} />
            )}
            {type == "purchase" && (
              <Purchase
                onChange={setBody}
                defaultValue={body}
                showExtra={showExtra}
              />
            )}
            {type == "task" && <Task onChange={setBody} />}
          </div>
        </>
      );
    }
  }

  return (
    <Layout.Content style={{ backgroundColor: "white" }}>
      <div
        style={{
          maxWidth: MAX_WIDTH,
          margin: "15px auto",
          padding: "15px",
          backgroundColor: "white",
          color: COLORS.GRAY_D,
        }}
      >
        <Title level={1} style={{ textAlign: "center" }}>
          {router.query.title ?? "Create a New Support Ticket"}
        </Title>
        {showExtra && (
          <>
            <Space>
              <p style={{ fontSize: "12pt" }}>
                Create a new support ticket below or{" "}
                <A href="/support/tickets">
                  check the status of your support tickets
                </A>
                .{" "}
                {helpEmail ? (
                  <>
                    You can also email us directly at{" "}
                    <A href={`mailto:${helpEmail}`}>{helpEmail}</A>{" "}
                    {supportVideoCall ? (
                      <>
                        or{" "}
                        <A href={supportVideoCall}>
                          book a demo or discovery call
                        </A>
                      </>
                    ) : undefined}
                    .
                  </>
                ) : undefined}
              </p>
              <VideoItem
                width={600}
                style={{ margin: "15px 0", width: "600px" }}
                id={"4Ef9sxX59XM"}
              />
            </Space>
            {openaiEnabled && onCoCalcCom && !CHATGPT_DISABLED ? (
              <ChatGPT siteName={siteName} />
            ) : undefined}
            <FAQ />
            <Title level={2}>Create Your Ticket</Title>
            <Instructions />
            <Divider>Support Ticket</Divider>
          </>
        )}
        <form>
          <VSpace>
            <b>
              <Status done={isValidEmailAddress(email)} /> Your Email Address
            </b>
            <Input
              prefix={
                <Icon name="envelope" style={{ color: "rgba(0,0,0,.25)" }} />
              }
              defaultValue={email}
              placeholder="Email address..."
              style={{ maxWidth: "500px" }}
              onChange={(e) => setEmail(e.target.value)}
            />
            <br />
            <b>
              <Status done={subject} /> Subject
            </b>
            <Input
              placeholder="Summarize what this is about..."
              onChange={(e) => setSubject(e.target.value)}
              defaultValue={subject}
            />
            <br />
            <b>
              Is this a <i>Problem</i>, <i>Question</i>, or{" "}
              <i>Software Install Task</i>?
            </b>
            <Radio.Group
              name="radiogroup"
              defaultValue={type}
              onChange={(e) => setType(e.target.value)}
            >
              <VSpace>
                <Radio value={"problem"}>
                  <Type type="problem" /> Something is not working the way I
                  think it should work.
                </Radio>
                <Radio value={"question"}>
                  <Type type="question" /> I have a question about billing,
                  functionality, teaching, something not working, etc.
                </Radio>
                <Radio value={"task"}>
                  <Type type="task" /> Is it possible for you to install some
                  software that I need in order to use <SiteName />?
                </Radio>
                <Radio value={"purchase"}>
                  <Type type="purchase" /> I have a question regarding
                  purchasing a product.
                </Radio>
                <Radio value={"chat"}>
                  <Type type="chat" /> I would like to schedule a video chat.
                </Radio>
              </VSpace>
            </Radio.Group>
            <br />
            {showExtra && type !== "purchase" && type != "chat" && (
              <>
                <Files onChange={setFiles} />
                <br />
              </>
            )}
            {renderChat()}
          </VSpace>

          <div style={{ textAlign: "center", marginTop: "30px" }}>
            {!hasRequired && (
              <Alert
                showIcon
                style={{ margin: "15px 30px" }}
                type="error"
                description={`You must replace the text '${required}' everywhere above with the requested information.`}
              />
            )}
            {type != "chat" && (
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
                  : (body ?? "").length < MIN_BODY_LENGTH
                  ? `Describe your ${type} in detail above`
                  : "Create Support Ticket"}
              </Button>
            )}
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
                {helpEmail ? (
                  <>
                    If you continue to have problems, email us directly at{" "}
                    <A href={`mailto:${helpEmail}`}>{helpEmail}</A>.
                  </>
                ) : undefined}
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
        <p style={{ marginTop: "30px" }}>
          After submitting this, you'll receive a link, which you should save
          until you receive a confirmation email. You can also{" "}
          <A href="/support/tickets">check the status of your tickets here</A>.
        </p>
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
              ? "\n\nWHAT DID YOU DO EXACTLY?\n\n" + e.target.value
              : "",
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
            e.target.value ? "\n\nWHAT HAPPENED?\n\n" + e.target.value : "",
          )
        }
      />
      <br />
      <b>How did this differ from what you expected?</b>
      <Input.TextArea
        rows={3}
        placeholder="Explain how this differs from what you expected..."
        onChange={(e) =>
          update(
            2,
            e.target.value
              ? "\n\nHOW DID THIS DIFFER FROM WHAT YOU EXPECTED?\n\n" +
                  e.target.value
              : "",
          )
        }
      />
    </VSpace>
  );
}

function Question({ defaultValue, onChange }) {
  return (
    <Input.TextArea
      rows={8}
      defaultValue={defaultValue}
      placeholder="Your question..."
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Purchase({ defaultValue, onChange, showExtra }) {
  return (
    <>
      {showExtra && (
        <Paragraph>
          Please describe what you want to purchase. We need some context in
          order to guide you. In particular:
          <ul>
            <li>
              The expected number of projects: this is either the number of
              users, or how many projects they'll collectively be using.
            </li>
            <li>
              The kind of workload: this ranges from student projects with
              minimal resource requirements to large and resource intensive
              research projects.
            </li>
            <li>How long you expect to use the services.</li>
            <li>
              Your type of organization: i.e. if an academic discount applies to
              you.
            </li>
          </ul>
        </Paragraph>
      )}
      <Input.TextArea
        rows={8}
        defaultValue={defaultValue}
        placeholder="Your purchase request..."
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function Task({ onChange }) {
  const answers = useRef<[string, string, string]>(["", "", ""]);
  function update(i: 0 | 1 | 2, value: string): void {
    answers.current[i] = value;
    onChange?.(answers.current.join("\n\n\n").trim());
  }

  const [showWestPoint, setShowWestPoint] = useState<boolean>(false);

  return (
    <div>
      <Modal
        width="700px"
        open={showWestPoint}
        onCancel={() => setShowWestPoint(false)}
        onOk={() => setShowWestPoint(false)}
        title={
          <div>
            A question about CoCalc ...
            <A href="https://www.westpoint.edu/mathematical-sciences/profile/joseph_lindquist">
              <div
                style={{
                  fontSize: "10px",
                  float: "right",
                  width: "125px",
                  margin: "0 20px",
                }}
              >
                <img
                  style={{ width: "125px" }}
                  src="https://s3.amazonaws.com/usma-media/styles/profile_image_display/s3/inline-images/academics/academic_departments/mathematical_sciences/images/profiles/COL%20JOE%20LINDQUIST.jpg?itok=r9vjncwh"
                />
                Colonel Joe Lindquist
                <br />
                West Point
              </div>
            </A>
          </div>
        }
      >
        <b>WHAT SOFTWARE DO YOU NEED?</b>
        <br />
        Hi Team! I'm getting ready to kick off our short course at West Point
        that will deal with Natural Language Processing. We're still sorting out
        the purchase request, but expect it to be complete in the next day or
        so. It looks like you have the "big" packages installed that we will be
        exploring... Huggingface, Transformers, NLTK, WordBlob... but another
        package that I was hoping to use is vadersentiment (
        <A href="https://pypi.org/project/vaderSentiment/">
          https://pypi.org/project/vaderSentiment/
        </A>
        ).
        <br />
        <br />
        <b>HOW DO YOU PLAN TO USE THIS SOFTWARE?</b>
        <br />
        The course begins on 15MAR and I'd love to be able to use it for this.
        I'm happy to assume some guidance on how to best incorporate this into
        CoCalc if unable to install the package.
        <br />
        <br />
        <b>HOW CAN WE TEST THAT THE SOFTWARE IS PROPERLY INSTALLED?</b>
        <CodeMirror
          fontSize={12}
          lineNumbers={false}
          filename="a.py"
          content={`from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
sid_obj = SentimentIntensityAnalyzer()
text = "CoCalc is an amazing platform for students to learn how to understand NLP!"
print(sid_obj.polarity_scores(text))`}
        />
        <br />
        This should return:
        <CodeMirror
          fontSize={12}
          lineNumbers={false}
          filename="a.json"
          content={
            "{'neg': 0.0, 'neu': 0.746, 'pos': 0.254, 'compound': 0.6239}"
          }
        />
        <br />
        One Day Later
        <br />
        You guys are fantastic! Such a quick turn-around. Please feel free to
        use the request in any fashion you wish 😊
        <br />
        By the way… in case you were wondering, “You guys are fantastic!” has a
        compound polarity score of 0.598 😊. I used it in CoCalc to test the
        update.
      </Modal>
      Each <SiteName /> project is a Docker image running Ubuntu Linux on 64-bit
      x86 hardware, so it is possible for us to install most standard Linux
      software, and we have already installed{" "}
      <A href="/software">a huge amount</A>. If there is something you need that
      is missing, let us know below. You can also{" "}
      <a onClick={() => setShowWestPoint(true)}>
        view a recent ticket from West Point
      </a>{" "}
      for an example install request.
      <br />
      <br />
      <b>What software do you need?</b> In particular, if this is a Python
      library, explain which of the{" "}
      <A href="software/python">many Python environments</A> you need it
      installed into and why you can't just{" "}
      <A href="https://doc.cocalc.com/howto/install-python-lib.html">
        install it yourself
      </A>
      .
      <br />
      <Input.TextArea
        style={{ marginTop: "10px" }}
        rows={4}
        placeholder="Describe what software you need installed..."
        onChange={(e) =>
          update(
            0,
            e.target.value
              ? "\n\nWHAT SOFTWARE DO YOU NEED?\n\n" + e.target.value
              : "",
          )
        }
      />
      <br />
      <br />
      <br />
      <b>How do you plan to use this software?</b> For example, does it need to
      be installed across <SiteName /> for a course you are teaching that starts
      in 3 weeks?
      <br />
      <Input.TextArea
        style={{ marginTop: "10px" }}
        rows={3}
        placeholder="Explain how you will use the software ..."
        onChange={(e) =>
          update(
            1,
            e.target.value
              ? "\n\nHOW DO YOU PLAN TO USE THIS SOFTWARE?\n\n" + e.target.value
              : "",
          )
        }
      />
      <br />
      <br />
      <br />
      <b>How can we test that the software is properly installed?</b>
      <br />
      <Input.TextArea
        style={{ marginTop: "10px" }}
        rows={3}
        placeholder="Explain how we can test the software..."
        onChange={(e) =>
          update(
            2,
            e.target.value
              ? "\n\nHOW CAN WE TEST THAT THE SOFTWARE IS PROPERLY INSTALLED?\n\n" +
                  e.target.value
              : "",
          )
        }
      />
    </div>
  );
}
function Instructions() {
  return (
    <div>
      <p>
        If the above links don't help you solve your problem, please create a
        support ticket below. Support is currently available in{" "}
        <b>English, German, and Russian</b> only.
      </p>
    </div>
  );
}

function ChatGPT({ siteName }) {
  return (
    <div style={{ margin: "15px 0 20px 0" }}>
      <Title level={2}>ChatGPT</Title>
      <div style={{ color: "#666" }}>
        If you have a question about how to do something using {siteName},
        ChatGPT might save you some time:
      </div>
      <ChatGPTHelp style={{ marginTop: "15px" }} tag={"support"} />
    </div>
  );
}

function FAQ() {
  return (
    <div>
      <Title level={2}>Helpful Links</Title>
      <Alert
        message={""}
        style={{ margin: "20px 0" }}
        type="warning"
        description={
          <ul style={{ marginBottom: 0, fontSize: "11pt" }}>
            <li>
              <A href="https://doc.cocalc.com/">The CoCalc Manual</A>
            </li>
            <li>
              <A href="https://github.com/sagemathinc/cocalc/issues">
                Bug reports
              </A>
            </li>
            <li>
              <A href="https://github.com/sagemathinc/cocalc/discussions">
                The CoCalc Discussion Forum
              </A>
            </li>
            <li>
              {" "}
              <A href="https://doc.cocalc.com/howto/missing-project.html">
                Help: My file or project appears to be missing!
              </A>{" "}
            </li>
            <li>
              {" "}
              I have{" "}
              <A href="https://doc.cocalc.com/howto/sage-question.html">
                general questions about SageMath...
              </A>
            </li>
          </ul>
        }
      />
    </div>
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
