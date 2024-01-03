/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Layout, Row } from "antd";

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import GoogleGeminiLogo from "@cocalc/frontend/components/google-gemini-avatar";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import AILLMQuery from "/public/features/ai-llm-cprogram-query.png";
import AILLMCprogramRun from "/public/features/ai-llm-cprogram-run.png";
import ChatGptInChatroom from "/public/features/chatgpt-fix-code.png";
import ChatGptGenerateCodeRun from "/public/features/chatgpt-generate-code-run.png";
import ChatGptGenerateCode from "/public/features/chatgpt-generate-code.png";

const title = `AI Assistance`;
const component = title;

export default function AI({ customize }) {
  const { googleVertexaiEnabled, openaiEnabled } = customize;

  const iconTxtStyle = {
    fontSize: "20px",
    verticalAlign: "text-bottom",
  };

  const codePrompt =
    "Write a short C program, which iterates over all numbers from 0 to 100 and sums up those, which are divisible by 7!";

  return (
    <Customize value={customize}>
      <Head title={`${title} | Features | CoCalc`} />
      <Layout>
        <Header page="features" subPage="ai" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            logo={<AIAvatar size={128} />}
            title={title}
            subtitleBelow={true}
            subtitle={
              <>
                <div>
                  Large language models like{" "}
                  <A href="https://openai.com/chatgpt">OpenAI's ChatGPT</A> or{" "}
                  <A href="https://deepmind.google/technologies/gemini/">
                    Google's Gemini
                  </A>{" "}
                  are capable of generating human-like responses and code based
                  on various prompts and queries. CoCalc integrates them as a
                  virtual assistants. They help you with coding, understand
                  error message, generate code, and ultimately making it easier
                  for you to work with various programming languages.
                </div>
              </>
            }
            image={AILLMQuery}
            alt={"AI assistance in CoCalc"}
            caption={"AI assistance in a CoCalc"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>Help with coding</Title>
                <Paragraph>
                  <li>ChatGPT understands most programming languages.</li>
                  <li>Based on your input, it can generate code for you.</li>
                  <li>
                    It is able to interpret error messages and give suggestions.
                  </li>
                  <li>Fixes code, by modifying a snippet of code of yours.</li>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Virtual assistant</Title>
                <Paragraph>
                  <li>
                    ChatGPT provides virtual assistance, helping you fix bugs,
                    and understand and write code. It supports all programming
                    languages and is easy to use with the click of a button.
                  </li>
                  <li>You can also ask it to add documentation to code.</li>
                  <li>
                    Complete code based on existing code and an instruction.
                  </li>
                </Paragraph>
              </>
            }
          />

          <Info.Heading
            description={
              <>
                <Paragraph>
                  There are various places where AI assistants appears in
                  CoCalc, as illustrated below and{" "}
                  <A href="https://doc.cocalc.com/chatgpt.html">
                    explained in the docs
                  </A>
                  .
                </Paragraph>
                <Paragraph>
                  CoCalc currently supports the following language models:
                </Paragraph>
                <Paragraph>
                  <Row gutter={[30, 30]}>
                    {openaiEnabled ? (
                      <Col md={6} offset={6}>
                        <OpenAIAvatar size={32} />{" "}
                        <A
                          href="https://openai.com/chatgpt"
                          style={iconTxtStyle}
                        >
                          OpenAI's ChatGPT
                        </A>
                      </Col>
                    ) : undefined}
                    {googleVertexaiEnabled ? (
                      <Col md={6}>
                        <GoogleGeminiLogo size={32} />{" "}
                        <A
                          href="https://deepmind.google/technologies/gemini/"
                          style={iconTxtStyle}
                        >
                          Google's Gemini
                        </A>
                      </Col>
                    ) : undefined}
                  </Row>
                </Paragraph>
              </>
            }
          >
            AI language models in CoCalc
          </Info.Heading>

          <ChatGPTFixError />

          <Info
            title={"Mention @chatgpt in any Chatroom in CoCalc"}
            icon="comment"
            image={ChatGptGenerateCode}
            anchor="a-chatgpt-generate"
            alt="ChatGPT generates code in a chatroom"
          >
            <Paragraph>
              Here, a user learning <A href="https://pytorch.org/">PyTorch</A>{" "}
              asks ChatGPT by{" "}
              <A href="https://doc.cocalc.com/chatgpt.html#chatgpt-in-chat-rooms-and-side-chat">
                mentioning
              </A>{" "}
              <Text code>@chatgpt</Text> in a{" "}
              <A href="https://doc.cocalc.com/chat.html#side-chat">Side Chat</A>
              . The prompt is:
            </Paragraph>
            <Paragraph>
              <blockquote>multiply two random matrices in pytorch</blockquote>
            </Paragraph>
            <Paragraph>
              Sure enough, ChatGPT generates code that does exactly that. By
              copying that simple example into your Jupyter Notebook, the user
              can immediately run it and continue to play around with it.
            </Paragraph>
            <Paragraph>
              <Image
                src={ChatGptGenerateCodeRun}
                alt="Running code snippet generated by ChatGPT"
              />
            </Paragraph>
            {googleVertexaiEnabled ? (
              <Paragraph>
                Note: Mention <Text code>@gemini</Text> to talk to Google's
                Gemini model.
              </Paragraph>
            ) : undefined}
          </Info>

          <Info
            title={"Generating Code"}
            icon="pen"
            image={AILLMCprogramRun}
            anchor="a-chatgpt-cpp"
            alt="Gemini generates C++ code in a file"
            narrow
          >
            <Paragraph>
              ChatGPT or Gemini can also generate source code for you. In the
              example on the left, first we first create an empty{" "}
              <Text code>c-program.cpp</Text> C++ file. Then, we open the AI
              Assistant dialog and a prompt it to generate some code:
              <blockquote>{codePrompt}</blockquote>
            </Paragraph>
            <Paragraph>
              <Image src={AILLMQuery} alt={codePrompt} />
            </Paragraph>
            <Paragraph>
              We then copy the code into the file - as seen on the left – and
              compile using <Text code>clang++</Text> and run it right on the
              spot. This is done using the{" "}
              <A href="https://doc.cocalc.com/frame-editor.html">
                Frame Editor's
              </A>{" "}
              <A href="/features/terminal">Terminal</A>.
            </Paragraph>
          </Info>

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

export function ChatGPTFixError({ embedded = false }: { embedded?: boolean }) {
  const title = embedded ? "ChatGPT fixes code" : "Help fixing code";

  // a general intro about what this is, if this block is embeded on another page
  function intro() {
    if (!embedded) return null;
    return (
      <Paragraph>
        Use the power of <A href="/features/ai">ChatGPT</A> to help fixing
        errors or to generate code.
      </Paragraph>
    );
  }

  return (
    <Info
      title={title}
      icon="bug"
      image={ChatGptInChatroom}
      anchor="a-chatgpt-notebook"
      alt="ChatGPT explains an error message and fixes code"
      wide
    >
      {intro()}
      <Paragraph>
        In this example, a code cell in a{" "}
        <A href="/features/jupyter-notebook">Jupyter Notebook</A> returned an
        error. Clicking the botton to explain the error message creates a
        message addressed to ChatGPT, which asks for help and to fix the code.
      </Paragraph>
      <Paragraph>
        With enough context – the few lines of input code and the lines in the
        stacktrace – it will attempt to fix the code for you. The fix might not
        be perfect, but it can be a good starting point.
      </Paragraph>
    </Info>
  );
}
