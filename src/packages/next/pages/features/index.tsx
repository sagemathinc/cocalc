import A from "components/misc/A";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import LaTeX from "components/landing/latex";
import IndexList, { DataSource } from "components/landing/index-list";

import JupyterLogo from "/public/features/jupyter-logo.svg";
import JupyterTF from "/public/features/cocalc-jupyter2-20170508.png";
import PythonLogo from "/public/features/python-logo.svg";
import FrameEditorPython from "/public/features/frame-editor-python.png";
import Rlogo from "/public/features/r-logo.svg";
import RJupyter from "/public/features/cocalc-r-jupyter.png";
import LatexLogo from "/public/features/latex-logo.svg";
import LatexEditorImage from "/public/features/cocalc-latex-editor-2019.png";
import WhiteboardImage from "/public/features/whiteboard-sage.png";
import octaveLogo from "/public/features/octave-logo.svg";
import octaveJupyter from "/public/features/cocalc-octave-jupyter-20200511.png";
import x11Logo from "/public/features/x11-logo.svg";
import x11Screenshot from "/public/features/x11-01.png";
import linuxLogo from "/public/features/linux-logo.svg";
import linuxShellScript from "/public/features/cocalc-shell-script-run.png";
import terminalLogo from "/public/features/linux-logo.svg";
import terminalScreenshot from "/public/features/terminal.png";
import teachingLogo from "/public/features/fa-graduation-cap.svg";
import teachingScreenshot from "/public/features/cocalc-course-assignments-2019.png";
import apiScreenshot from "/public/features/api-screenshot.png";
import sageLogo from "/public/features/sage-sticker-1x1_inch-small.png";
import sageScreenshot from "public/features/sage-worksheet.png";
import juliaLogo from "public/features/julia-logo.svg";
import juliaScreenshot from "public/features/julia-jupyter.png";

const dataSource = [
  {
    link: "/features/jupyter-notebook",
    title: "Jupyter notebooks",
    logo: JupyterLogo,
    image: JupyterTF,
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
    link: "/features/python",
    title: "Huge installed Python stack",
    logo: PythonLogo,
    image: FrameEditorPython,
    description: (
      <>
        Use Python in CoCalc for data science, statistics, mathematics, physics,
        machine learning. Many{" "}
        <A href="/software/python">packages are included in CoCalc</A>!
      </>
    ),
  },
  {
    link: "/features/whiteboard",
    title: <>Collaborative Whiteboard</>,
    logo: "layout",
    image: WhiteboardImage,
    description: (
      <>
        CoCalc's collaborative whiteboard fully supports writing mathematics
        using LaTeX and doing computation using Jupyter code cells on an
        infinite canvas.
      </>
    ),
  },
  {
    link: "/features/r-statistical-software",
    title: "R statistical software",
    logo: Rlogo,
    image: RJupyter,
    description: (
      <>
        Use Jupyter notebooks with the R kernel, the R command line, X11
        graphics, <LaTeX /> with Knitr and RMarkdown, and more.
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
    link: "/features/sage",
    title: "SageMath Online",
    logo: sageLogo,
    image: sageScreenshot,
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
    image: octaveJupyter,
    description: (
      <>
        Run <A href="https://www.gnu.org/software/octave/">GNU Octave</A> on
        CoCalc – the syntax is largely compatible with MATLAB
        <sup>®</sup>. Use Jupyter notebooks, write programs, and display X11
        graphics.
      </>
    ),
  },
  {
    link: "/features/julia",
    title: "Julia",
    logo: juliaLogo,
    image: juliaScreenshot,
    description: (
      <>
        Use <A href="https://julialang.org/">Julia</A> on CoCalc with{" "}
        <A href="https://doc.cocalc.com/howto/pluto.html">Pluto</A> and{" "}
        <A href="/features/jupyter-notebook">Jupyter</A> notebooks. Edit Julia
        code and run it in <A href="/features/terminal">a terminal</A> or
        notebook. <A href="/features/teaching">Teach classes using nbgrader</A>{" "}
        with the Julia kernel.
      </>
    ),
  },
  {
    link: "/features/x11",
    title: "Linux graphical X11 desktop",
    logo: x11Logo,
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
    link: "/features/linux",
    title: "Online Linux environment",
    logo: linuxLogo,
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
    link: "/features/terminal",
    title: "Linux terminal",
    logo: terminalLogo,
    image: terminalScreenshot,
    description: (
      <>
        Work in a collaborative remote Linux shell. Read more in our{" "}
        <A href="https://doc.cocalc.com/terminal.html">documentation</A>.
      </>
    ),
  },
  {
    link: "/features/teaching",
    title: "Teaching a course",
    logo: teachingLogo,
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
    link: "/features/api",
    title: "API interface",
    image: apiScreenshot,
    logo: "server",
    description: (
      <>
        Programmatically control CoCalc from your own server. Embed CoCalc
        within other products with a customized external look and feel.
      </>
    ),
  },
  {
    link: "https://doc.cocalc.com",
    title: "There is more to explore",
    logo: sageLogo,
    image: sageScreenshot,
    description: (
      <>
        Use <A href="https://doc.cocalc.com/sagews.html">Sage Worksheets</A>,{" "}
        <A href="https://doc.cocalc.com/teaching-instructors.html">
          Course management
        </A>
        , <A href="https://doc.cocalc.com/tasks.html">Task management</A>,{" "}
        <A href="https://doc.cocalc.com/chat.html">Chat</A>, etc.
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
          description="These pages are an overview of what CoCalc is able to do."
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
