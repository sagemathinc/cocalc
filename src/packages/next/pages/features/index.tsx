/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { COLORS } from "@cocalc/util/theme";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import IndexList, { DataSource } from "components/landing/index-list";
import LaTeX from "components/landing/latex";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import juliaScreenshot from "public/features/julia-jupyter.png";
import juliaLogo from "public/features/julia-logo.svg";
import sageScreenshot from "public/features/sage-worksheet.png";
import apiScreenshot from "/public/features/api-screenshot.png";
import ChatGptInChatroom from "/public/features/chatgpt-fix-code.png";
import teachingScreenshot from "/public/features/cocalc-course-assignments-2019.png";
import JupyterTF from "/public/features/cocalc-jupyter2-20170508.png";
import LatexEditorImage from "public/features/latex-editor-main-20251003.png";
import octaveJupyter from "/public/features/cocalc-octave-jupyter-20200511.png";
import RJupyter from "/public/features/cocalc-r-jupyter.png";
import linuxShellScript from "/public/features/cocalc-shell-script-run.png";
import teachingLogo from "/public/features/fa-graduation-cap.svg";
import FrameEditorPython from "/public/features/frame-editor-python.png";
import JupyterLogo from "/public/features/jupyter-logo.svg";
import LatexLogo from "/public/features/latex-logo.svg";
import {
  default as linuxLogo,
  default as terminalLogo,
} from "/public/features/linux-logo.svg";
import octaveLogo from "/public/features/octave-logo.svg";
import PythonLogo from "/public/features/python-logo.svg";
import Rlogo from "/public/features/r-logo.svg";
import sageLogo from "/public/features/sage-sticker-1x1_inch-small.png";
import terminalScreenshot from "/public/features/terminal.png";
import WhiteboardImage from "/public/features/whiteboard-sage.png";
import x11Screenshot from "/public/features/x11-01.png";
import x11Logo from "/public/features/x11-logo.svg";

import AIAvatar from "@cocalc/frontend/components/ai-avatar";

const dataSource = [
  {
    link: "/features/jupyter-notebook",
    title: "Jupyter Notebooks",
    logo: JupyterLogo,
    image: JupyterTF,
    logoBackground: "white",
    description: (
      <>
        We provide a CoCalc specific version of Jupyter notebooks with real-time
        collaboration, chat, and high precision edit history. Explore in more
        detail in{" "}
        <A href="https://doc.cocalc.com/jupyter.html">the documentation</A>.
      </>
    ),
  },
  {
    link: "/features/latex-editor",
    title: (
      <>
        Collaborative <LaTeX /> editor
      </>
    ),
    logo: LatexLogo,
    logoBackground: "white",
    image: LatexEditorImage,
    description: (
      <>
        CoCalc's <LaTeX /> editor can help you be a more productive author
        online. Check out{" "}
        <A href="https://doc.cocalc.com/latex.html">its documentation</A>.
      </>
    ),
  },
  {
    link: "/features/ai",
    title: <>AI Assistant</>,
    logoBackground: "white",
    logo: <AIAvatar size={64} />,
    image: ChatGptInChatroom,
    description: (
      <>
        CoCalc extensively integrates with AI language models, including{" "}
        <A href="https://openai.com/">OpenAI's ChatGPT</A>,{" "}
        <A href="https://deepmind.google/technologies/gemini/">
          Google's Gemini
        </A>
        ,<A href="https://www.anthropic.com/claude">Anthropic's Claude</A>, and{" "}
        <A href="https://mistral.ai/">Mistral</A>. It participates in a{" "}
        <A href={"https://doc.cocalc.com/chat.html"}>Chatroom</A> as a bot,
        helps you understand your code, deciphers error messages in{" "}
        <A href={"/features/jupyter-notebook"}>Jupyter notebooks</A> or
        generates code or even an entire file for you.
      </>
    ),
  },
  {
    link: "/features/slides",
    title: <>Whiteboard & Slides</>,
    logo: "layout",
    image: WhiteboardImage,
    description: (
      <>
        CoCalc's collaborative <A href={"/features/whiteboard"}>whiteboard</A>{" "}
        and <A href={"/features/slides"}>slides</A> documents help you
        visualizing your ideas on an infinite canvas or on finite slides for a
        presentation. Jupyter code cells make it possible to embed calculations
        and plots, write mathematics using LaTeX, and more.
      </>
    ),
  },
  {
    link: "/features/r-statistical-software",
    title: "R Statistical Software",
    logo: Rlogo,
    image: RJupyter,
    logoBackground: "white",
    description: (
      <>
        Use Jupyter notebooks with the R kernel, the R command line, X11
        graphics, <LaTeX /> with Knitr and RMarkdown, and more. Many{" "}
        <A href="/software/r">R packages are included in CoCalc</A>!
      </>
    ),
  },
  {
    link: "/features/sage",
    title: "SageMath Online",
    logo: sageLogo,
    image: sageScreenshot,
    logoBackground: "white",
    description: (
      <>
        <A href="/features/sage">SageMath</A> is very well supported in CoCalc,
        because <A href="https://wstein.org">William Stein</A>, who started
        SageMath, also started CoCalc. Many versions of Sage are preinstalled
        and there is excellent integration with{" "}
        <A href="/features/latex-editor">
          <LaTeX />
        </A>
        .
      </>
    ),
  },
  {
    link: "/features/octave",
    title: "GNU Octave",
    logo: octaveLogo,
    logoBackground: "white",
    image: octaveJupyter,
    description: (
      <>
        Run <A href="https://www.gnu.org/software/octave/">GNU Octave</A> on
        CoCalc – the syntax is largely compatible with MATLAB
        <sup>®</sup>. Use Jupyter notebooks, write programs, and display X11
        graphics. Many{" "}
        <A href="/software/octave">Octave packages are included in CoCalc</A>!
      </>
    ),
  },
  {
    link: "/features/python",
    title: "Huge installed Python stack",
    logo: PythonLogo,
    image: FrameEditorPython,
    logoBackground: "white",
    description: (
      <>
        Use Python in CoCalc for data science, statistics, mathematics, physics,
        machine learning. Many{" "}
        <A href="/software/python">Python packages are included in CoCalc</A>!
      </>
    ),
  },
  {
    link: "/features/julia",
    title: "Julia",
    logo: juliaLogo,
    logoBackground: "white",
    image: juliaScreenshot,
    description: (
      <>
        Use <A href="https://julialang.org/">Julia</A> on CoCalc with{" "}
        <A href="https://doc.cocalc.com/howto/pluto.html">Pluto</A> and{" "}
        <A href="/features/jupyter-notebook">Jupyter</A> notebooks. Edit Julia
        code and run it in <A href="/features/terminal">a terminal</A> or
        notebook. <A href="/features/teaching">Teach classes using nbgrader</A>{" "}
        with the Julia kernel. Many{" "}
        <A href="/software/julia">Julia packages are included in CoCalc</A>!
      </>
    ),
  },
  {
    link: "/features/terminal",
    title: "Linux Terminal",
    logo: terminalLogo,
    logoBackground: "white",
    image: terminalScreenshot,
    description: (
      <>
        Work in a collaborative remote Linux shell. Read more in our{" "}
        <A href="https://doc.cocalc.com/terminal.html">documentation</A>.
      </>
    ),
  },
  {
    link: "/features/linux",
    title: "Online Linux environment",
    logo: linuxLogo,
    logoBackground: "white",
    image: linuxShellScript,
    description: (
      <>
        Use a collaborative online{" "}
        <A href="https://doc.cocalc.com/terminal.html">Linux terminal</A>, edit
        and run Bash scripts, or work in a Jupyter Notebooks running the Bash
        kernel.
      </>
    ),
  },
  {
    link: "/features/teaching",
    title: "Teaching a Course",
    logo: teachingLogo,
    logoBackground: "white",
    image: teachingScreenshot,
    description: (
      <>
        Organize and teach a course and automatically grade Jupyter notebooks.
        Read more in the{" "}
        <A href="https://doc.cocalc.com/teaching-instructors.html">
          instructor guide
        </A>
        .
      </>
    ),
  },
  {
    link: "/features/x11",
    title: "Linux graphical X11 desktop",
    logo: x11Logo,
    logoBackground: "white",
    image: x11Screenshot,
    description: (
      <>
        Run graphical applications in CoCalc's remote virtual desktop
        environment. Read more in the{" "}
        <A href="https://doc.cocalc.com/x11.html">X11 documentation</A>.
      </>
    ),
  },
  {
    link: "/features/api",
    title: "API Interface",
    image: apiScreenshot,
    logo: "server",
    logoBackground: COLORS.YELL_D,
    description: (
      <>
        Programmatically control CoCalc from your own server. Embed CoCalc
        within other products with a customized external look and feel.
      </>
    ),
  },
  {
    link: "https://doc.cocalc.com",
    title: "There is much more to explore",
    logo: "flash",
    image: sageScreenshot,
    logoBackground: COLORS.BS_GREEN_BGRND,
    description: (
      <>
        Use <A href="https://doc.cocalc.com/sagews.html">Sage Worksheets</A>,{" "}
        <A href="https://doc.cocalc.com/teaching-instructors.html">
          Course management
        </A>
        , <A href="https://doc.cocalc.com/tasks.html">Task management</A>,{" "}
        <A href="https://doc.cocalc.com/chat.html">Chat</A>,{" "}
        <A href="https://about.cocalc.com/">and more...</A>
      </>
    ),
  },
] as DataSource;

export default function Features({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Features" />
      <Layout>
        <Header page="features" />
        <IndexList
          title="Overview of CoCalc features"
          description={
            <>
              These pages are an overview of what CoCalc is able to do. You can
              also
              <ul>
                <li>
                  browse <A href="/software">installed software</A>,
                </li>
                <li>
                  see how <A href="/share">other people are using CoCalc</A>,
                  and
                </li>
                <li>
                  learn about our{" "}
                  <A href="https://about.cocalc.com">
                    mission, developers and features.
                  </A>
                </li>
              </ul>
            </>
          }
          dataSource={dataSource}
        />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
