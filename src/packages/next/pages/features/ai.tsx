/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Flex, Layout } from "antd";

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import AnthropicAvatar from "@cocalc/frontend/components/anthropic-avatar";
import GoogleGeminiLogo from "@cocalc/frontend/components/google-gemini-avatar";
import MistralAvatar from "@cocalc/frontend/components/mistral-avatar";
import OllamaAvatar from "@cocalc/frontend/components/ollama-avatar";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { DOC_AI } from "@cocalc/util/consts/ui";
import { COLORS } from "@cocalc/util/theme";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Info from "components/landing/info";
import LaTeX from "components/landing/latex";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import AiLateXGenerate from "/public/features/ai-latex-generate.png";
import AiLaTeXHelpMeFix from "/public/features/ai-latex-help-me-fix.png";
import AILaTeXAnswer from "/public/features/ai-latex-maxwell-answer.png";
import AILLMQuery from "/public/features/ai-llm-cprogram-query.png";
import AILLMCprogramRun from "/public/features/ai-llm-cprogram-run.png";
import ChatGptInChatroom from "/public/features/chatgpt-fix-code.png";
import ChatGptGenerateCodeRun from "/public/features/chatgpt-generate-code-run.png";
import ChatGptGenerateCode from "/public/features/chatgpt-generate-code.png";
import ChatGptJupyterCell from "/public/features/chatgpt-jupyter-linear-regression-cell.png";
import ChatGptJupyterPrompt from "/public/features/chatgpt-jupyter-linear-regression-prompt.png";

const title = `AI Assistant`;
const component = title;

export default function AI({ customize }) {
  const {
    googleVertexaiEnabled,
    openaiEnabled,
    mistralEnabled,
    anthropicEnabled,
    ollamaEnabled,
  } = customize;

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
            body={<AIAvatar size={128} />}
            title={title}
            subtitleBelow={true}
            subtitle={
              <>
                <div>
                  CoCalc integrates large language models including{" "}
                  <A href="https://openai.com/">OpenAI's ChatGPT</A>,{" "}
                  <A href="https://deepmind.google/technologies/gemini/">
                    Google's Gemini
                  </A>
                  ,{" "}
                  <A href="https://www.anthropic.com/claude">
                    Anthropic's Claude
                  </A>
                  , and <A href="https://mistral.ai/">Mistral</A> as virtual
                  assistants. They generate human-like responses and code,
                  assist with programming, explain error messages, and
                  ultimately making it easier for you to get your work done.
                </div>
              </>
            }
            image={AILLMQuery}
            alt={"AI Assistant in CoCalc"}
            caption={"AI Assistant in CoCalc"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>Help with coding</Title>
                <Paragraph>
                  <li>Understand a vast array of programming languages.</li>
                  <li>Generate context-specific code based on your input.</li>
                  <li>
                    Interpret error messages, providing insightful suggestions.
                  </li>
                  <li>
                    Enhance code quality by modifying your provided code
                    snippets.
                  </li>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Virtual assistant</Title>
                <Paragraph>
                  <li>
                    These language models, as virtual assistants, rectify bugs,
                    comprehend and write code across many programming languages
                    in a very convenient way.
                  </li>
                  <li>They are capable of appending documentation to code.</li>
                  <li>
                    They can even build upon existing code based on provided
                    directives.
                  </li>
                </Paragraph>
              </>
            }
          />

          <Info.Heading
            style={{ backgroundColor: COLORS.BS_GREEN_LL }}
            description={
              <>
                <Paragraph style={{ marginTop: "20px" }}>
                  There are various places where an AI Assistant appears in
                  CoCalc, as illustrated below and{" "}
                  <A href={DOC_AI}>explained in the docs</A>.
                </Paragraph>
                <Paragraph>
                  CoCalc currently supports the following language models:
                </Paragraph>
                <Paragraph>
                  <Flex
                    style={{ margin: "20px" }}
                    justify="space-between"
                    align="center"
                    wrap="wrap"
                  >
                    {openaiEnabled ? (
                      <span style={{ margin: "10px", whiteSpace: "nowrap" }}>
                        <OpenAIAvatar size={32} />{" "}
                        <A
                          href="https://openai.com/chatgpt"
                          style={iconTxtStyle}
                        >
                          OpenAI's ChatGPT
                        </A>
                      </span>
                    ) : undefined}
                    {googleVertexaiEnabled ? (
                      <span style={{ margin: "10px", whiteSpace: "nowrap" }}>
                        <GoogleGeminiLogo size={32} />{" "}
                        <A
                          href="https://deepmind.google/technologies/gemini/"
                          style={iconTxtStyle}
                        >
                          Google's Gemini
                        </A>
                      </span>
                    ) : undefined}
                    {anthropicEnabled ? (
                      <span style={{ margin: "10px", whiteSpace: "nowrap" }}>
                        <AnthropicAvatar size={32} />{" "}
                        <A
                          href="https://www.anthropic.com/claude"
                          style={iconTxtStyle}
                        >
                          Anthropic's Claude
                        </A>
                      </span>
                    ) : undefined}
                    {mistralEnabled ? (
                      <span style={{ margin: "10px", whiteSpace: "nowrap" }}>
                        <MistralAvatar size={32} />{" "}
                        <A href="https://mistral.ai/" style={iconTxtStyle}>
                          Mistral
                        </A>
                      </span>
                    ) : undefined}
                    {ollamaEnabled ? (
                      <span style={{ margin: "10px", whiteSpace: "nowrap" }}>
                        <OllamaAvatar size={32} />{" "}
                        <A href="https://ollama.com/" style={iconTxtStyle}>
                          Ollama
                        </A>
                      </span>
                    ) : undefined}
                  </Flex>
                </Paragraph>
              </>
            }
          >
            AI language models in CoCalc
          </Info.Heading>

          <ChatGPTFixError />

          <Info
            title={"Mention AI models in any Chatroom in CoCalc"}
            icon="comment"
            image={ChatGptGenerateCode}
            anchor="a-mention"
            alt="ChatGPT generates code in a chatroom"
          >
            <Paragraph>
              Here, a user learning <A href="https://pytorch.org/">PyTorch</A>{" "}
              asks ChatGPT by{" "}
              <A href={`${DOC_AI}#chatgpt-in-chat-rooms-and-side-chat`}>
                mentioning
              </A>{" "}
              <Text code>@</Text> in a{" "}
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
                Note: Use @ also to talk to Google's Gemini model.
              </Paragraph>
            ) : undefined}
          </Info>

          <Info
            narrow
            title={"Generate Jupyter Cells"}
            icon="jupyter"
            anchor="a-jupyter"
            alt="Generate Jupyter Cells"
            image={ChatGptJupyterCell}
            style={{ backgroundColor: COLORS.BLUE_LLLL }}
          >
            <Paragraph>
              In a <A href="./jupyter-notebook">Jupyter Notebook</A>, you can
              tell a language model to generate a cell for you. This is useful
              if you want to explore a topic, but don't know where to start. In
              the example on the left, we ask ChatGPT to generate a cell for us
              about a linear regression for a stochastic process:
            </Paragraph>
            <Paragraph>
              <Image
                src={ChatGptJupyterPrompt}
                alt="ChatGPT cell prompt in Jupyter Notebook"
              />
            </Paragraph>
          </Info>

          <Info
            title={"Generating Code"}
            icon="pen"
            image={AILLMCprogramRun}
            anchor="a-cpp"
            alt="Gemini generates C++ code in a file"
            narrow
            caption={<blockquote>{codePrompt}</blockquote>}
            below={
              <Paragraph>
                After the code is generated, we copy it into the
                <Text code>c-program.cpp</Text> file as depicted. To compile and
                run the C++ program, we use the <Text code>clang++</Text>{" "}
                compiler provided in the{" "}
                <A href="https://doc.cocalc.com/frame-editor.html">
                  Frame Editor's
                </A>{" "}
                <A href="/features/terminal">Terminal</A>.
              </Paragraph>
            }
          >
            <Paragraph>
              ChatGPT or Gemini can also generate source code for you. In the
              example displayed on the left, we first create an empty file named{" "}
              <Text code>c-program.cpp</Text> in C++. Next, we open the AI
              Assistant dialogue and prompt it to generate some code:
            </Paragraph>
            <Paragraph>
              <Image src={AILLMQuery} alt={codePrompt} />
            </Paragraph>
          </Info>

          <Info
            title={
              <>
                Help with <LaTeX />
              </>
            }
            icon="question-circle"
            anchor="a-latex"
            alt="Help with LaTeX"
            image={AiLateXGenerate}
            style={{ backgroundColor: COLORS.BLUE_LLLL }}
            below={
              <>
                <Paragraph>
                  On top of that, it can even assist you in{" "}
                  <Text strong>fixing LaTeX error messages</Text>. the "Help me
                  fix this…" button, and CoCalc will submit the error message,
                  some context, and a prompt for correction. This will provide
                  you with a useful indicator of the issue and potential
                  solutions.
                </Paragraph>
                <Paragraph style={{ textAlign: "center" }}>
                  <Image
                    src={AiLaTeXHelpMeFix}
                    alt="ChatGPT helps with LaTeX error messages"
                  />
                </Paragraph>
              </>
            }
          >
            <Paragraph>
              Writing documents in the typesetting language{" "}
              <A href="./latex-editor">LaTeX</A> can be challenging. In the
              example on the left, we ask ChatGPT to generate the LaTeX formulas
              for the Maxell equations. Sure enough, it answers with a short
              explanation and a snippet of LaTeX code.
            </Paragraph>
            <Paragraph>
              <Image
                src={AILaTeXAnswer}
                alt="ChatGPT generates LaTeX code for Maxwell equations"
              />
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
