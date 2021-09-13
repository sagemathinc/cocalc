import A from "components/misc/A";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import LaTeX from "components/landing/latex";
import Image from "components/landing/image";
import NextImage from "next/image";

import JupyterLogo from "/public/doc/jupyter-logo.svg";
import JupyterTF from "/public/doc/cocalc-jupyter2-20170508.png";
import PythonLogo from "/public/doc/python-logo.svg";
import FrameEditorPython from "/public/doc/frame-editor-python.png";
import Rlogo from "/public/doc/r-logo.svg";
import RJupyter from "/public/doc/cocalc-r-jupyter.png";
import LatexLogo from "/public/doc/latex-logo.svg";
import LatexEditorImage from "/public/doc/cocalc-latex-editor-2019.png";
import octaveLogo from "/public/doc/octave-logo.svg";
import octaveJupyter from "/public/doc/cocalc-octave-jupyter-20200511.png";
import x11Logo from "/public/doc/x11-logo.svg";
import x11Screenshot from "/public/doc/x11-01.png";
import linuxLogo from "/public/doc/linux-logo.svg";
import linuxShellScript from "/public/doc/cocalc-shell-script-run.png";
import terminalLogo from "/public/doc/linux-logo.svg";
import terminalScreenshot from "/public/doc/terminal.png";
import teachingLogo from "/public/doc/fa-graduation-cap.svg";
import teachingScreenshot from "/public/doc/cocalc-course-assignments-2019.png";
import apiScreenshot from "/public/doc/api-screenshot.png";
import sageLogo from "/public/doc/sage-sticker-1x1_inch-small.png";
import sageScreenshot from "/public/doc/cocalc-sagetex.png";

import { List, Avatar } from "antd";

const listData = [
  {
    href: "/doc/jupyter-notebook",
    title: "Jupyter Notebooks",
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
    link: "/doc/python",
    title: "Huge Preinstalled Python stack",
    logo: PythonLogo,
    image: FrameEditorPython,
    description: (
      <>
        {" "}
        Use Python in coCalc for data science, statistics, mathematics, physics,
        machine learning, and <A href="/doc/software-python">more</A>.{" "}
      </>
    ),
  },
  {
    link: "/doc/r-statistical-software",
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
    link: "/doc/latex-editor",
    title: (
      <>
        Collaborative <LaTeX /> Editor
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
    link: "/doc/octave",
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
    link: "/doc/x11",
    title: "Linux Graphical X11 Desktop",
    logo: x11Logo,
    image: x11Screenshot,
    description: (
      <>
        Run graphical applications in CoCalc's remote virtual display
        environment. Read more in the{" "}
        <A href="https://doc.cocalc.com/x11.html">X11 documentation</A>.
      </>
    ),
  },
  {
    link: "/doc/linux",
    title: "Online Linux Environment",
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
    link: "/doc/terminal",
    title: "Linux Terminal",
    logo: terminalLogo,
    image: terminalScreenshot,
    description: (
      <>
        Work in a collaborative remote Linux shell. Read more in its{" "}
        <A href="https://doc.cocalc.com/terminal.html">documentation</A>.
      </>
    ),
  },
  {
    link: "/doc/teaching",
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
    link: "https://doc.cocalc.com/api/",
    title: "API interface",
    image: apiScreenshot,
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
];

export default function Features({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="CoCalc Features" />
      <Layout>
        <Header page="features" />
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
            <h1>Overview of CoCalc features</h1>
            <p>These pages are an overview of what CoCalc is able to do.</p>
            <List
              itemLayout="vertical"
              size="large"
              dataSource={listData}
              renderItem={(item) => {
                return (
                  <List.Item
                    key={item.link}
                    extra={
                      item.image && (
                        <div style={{ width: "250px" }}>
                          <A href={item.link}>
                            <Image src={item.image} alt="logo" />
                          </A>
                        </div>
                      )
                    }
                  >
                    <List.Item.Meta
                      avatar={
                        item.logo && (
                          <Avatar
                            alt={item.title + " logo "}
                            size={80}
                            shape="square"
                            icon={
                              <NextImage
                                src={item.logo}
                                width={80}
                                height={80}
                              />
                            }
                          />
                        )
                      }
                      title={<A href={item.link}>{item.title}</A>}
                      description={
                        <span style={{ color: "#666" }}>
                          {item.description}
                        </span>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
