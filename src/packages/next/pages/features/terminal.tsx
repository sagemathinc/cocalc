import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Code from "components/landing/code";
import Head from "components/landing/head";
import Snapshots from "components/landing/snapshots";
import { FullLinuxTerminal } from "./linux";
import Comparison from "components/landing/compare";
import { Icon } from "@cocalc/frontend/components/icon";

const component = "a Linux Terminal";
const title = `Online Linux Terminal`;

import terminal from "/public/features/terminal.png";
import logo from "/public/features/linux-logo.svg";
import collabDemo from "/public/features/cocalc-terminal-collab.gif";
import shellScript from "/public/features/cocalc-shell-script-run.png";
import stack from "/public/features/terminal-software.png";

export default function Terminal({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="terminal" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              logo={logo}
              title={title}
              subtitle={
                "A Linux Terminal that can't mess up your own computer."
              }
              image={terminal}
              alt={"Running Sage in a Terminal"}
            />
          </div>

          <FullLinuxTerminal />

          <SignIn startup={component} />

          <Info.Heading
            description={
              <>There are many ways to use {component} online via CoCalc.</>
            }
          >
            Feature Overview
          </Info.Heading>

          <Info
            title="Realtime collaboration"
            icon="users"
            image={collabDemo}
            anchor="a-realtimecollab"
            alt={"Video showing synchronized terminals"}
            wide
          >
            <p>
              The same terminal can be opened by two or more users. Both see the
              same view, which adaptively resizes to a common size.
            </p>
            <p>
              Additionally, open a{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> panel to
              exchange thoughts and ideas.
            </p>
            <p>
              This is ideal for getting advice by a colleague or{" "}
              <A href="https://doc.cocalc.com/teaching-interactions.html">
                helping a student of yours
              </A>
              .
            </p>
          </Info>

          <Info
            title="Run Bash, Python, R, etc."
            icon="r"
            image={shellScript}
            anchor="a-shell-script"
            alt={"Screenshot of editing and running a shell script"}
            caption={
              <>
                Bash <Code>script.sh</Code> file (left),{" "}
                <Code>bash -f script.sh</Code> to run (right)
              </>
            }
          >
            <p>
              CoCalc's{" "}
              <A href="https://doc.cocalc.com/frame-editor.html">
                frame editor
              </A>{" "}
              supports <strong>editing script files</strong> side-by-side with a{" "}
              <strong>
                <A href="https://doc.cocalc.com/terminal.html">terminal</A>
              </strong>
              .
            </p>
            <p>
              To get started, create a file with a suitable ending, e.g.{" "}
              <Code>.py</Code>, <Code>.sh</Code>, <Code>.r</Code>, ... Then open
              that file (via <Code>open filename.ext</Code>) and you can edit it
              with <strong>syntax highlighting</strong>. Finally, split the
              frame and select the Terminal, like you can see it in the
              screenshot. Execute <Code>python3 script.py</Code>,{" "}
              <Code>bash -f script.sh</Code>, ... to run it.{" "}
            </p>
          </Info>

          <Info
            title="Comprehensive software stack"
            icon="server"
            image={stack}
            anchor="a-stack"
            alt={"Terminals software"}
            caption={
              "Linux Terminals using vim, emacs, clang, mysql, cpp, maxim and zsh!"
            }
            wide
          >
            <p>
              Many <strong>popular applications</strong> are included in CoCalc:{" "}
              <A href="https://git-scm.com/">Git</A> to interact with{" "}
              <A href="https://www.github.com">GitHub</A>,{" "}
              <A href="https://www.vim.org/">VIM</A>,{" "}
              <A href="https://www.gnu.org/software/emacs/">Emacs</A>, various
              programming shells like <A href="https://ipython.org/">IPython</A>
              , <A href="https://www.r-project.org/">R</A>,{" "}
              <A href="https://www.gnu.org/software/octave/index">Octave</A> and{" "}
              <A href="https://www.sagemath.org/">SageMath</A>.
            </p>
            <p>
              There is also support for many programming languages and
              compilers. <A href="/features/python">Python</A>, JAVA, C/C++ via{" "}
              <A href="https://gcc.gnu.org/">GCC</A> and{" "}
              <A href="https://clang.llvm.org/">Clang</A>,{" "}
              <A href="https://ziglang.org/">Zig</A>,{" "}
              <A href="https://en.wikipedia.org/wiki/Ada_(programming_language)">
                Ada
              </A>
              ,{" "}
              <A href="https://en.wikipedia.org/wiki/Haskell_(programming_language)">
                Haskell
              </A>
              , <A href="https://en.wikipedia.org/wiki/Smalltalk">Smalltalk</A>,{" "}
              <A href="https://www.rust-lang.org/">Rust</A> and many more.
            </p>
            <p>
              Look at our{" "}
              <strong>
                <A href="/features/software-executables">list of executables</A>
              </strong>{" "}
              to check what is available!{" "}
            </p>
          </Info>

          <Snapshots />

          <Comparison
            name="terminal"
            disclaimer
            title={
              <h2 style={{ textAlign: "center" }}>
                <Icon name="bolt" /> Terminals in CoCalc versus the competition
              </h2>
            }
          />

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
