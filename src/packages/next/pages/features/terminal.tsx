/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Code from "components/landing/code";
import Comparison from "components/landing/compare";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import SignIn from "components/landing/sign-in";
import Snapshots from "components/landing/snapshots";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { FullLinuxTerminal } from "./linux";
import shellScript from "/public/features/cocalc-shell-script-run.png";
import collabDemo from "/public/features/cocalc-terminal-collab.gif";
import logo from "/public/features/linux-logo.svg";
import stack from "/public/features/terminal-software.png";
import terminal from "/public/features/terminal.png";

const component = "a Linux Terminal";
const title = `Online Linux Terminal`;

export default function Terminal({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="terminal" runnableTag="term" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            body={logo}
            title={title}
            subtitle={"A Linux Terminal that can't mess up your own computer."}
            subtitleBelow={true}
            image={terminal}
            alt={"Running Sage in a Terminal"}
          />

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
            <Paragraph>
              The same terminal can be opened by two or more users. Both see the
              same view, which adaptively resizes to a common size.
            </Paragraph>
            <Paragraph>
              Additionally, open a{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> panel to
              exchange thoughts and ideas.
            </Paragraph>
            <Paragraph>
              This is ideal for getting advice by a colleague or{" "}
              <A href="https://doc.cocalc.com/teaching-interactions.html">
                helping a student of yours
              </A>
              .
            </Paragraph>
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
            <Paragraph>
              CoCalc's{" "}
              <A href="https://doc.cocalc.com/frame-editor.html">
                frame editor
              </A>{" "}
              supports <strong>editing script files</strong> side-by-side with a{" "}
              <strong>
                <A href="https://doc.cocalc.com/terminal.html">terminal</A>
              </strong>
              .
            </Paragraph>
            <Paragraph>
              To get started, create a file with a suitable ending, e.g.{" "}
              <Code>.py</Code>, <Code>.sh</Code>, <Code>.r</Code>, ... Then open
              that file (via <Code>open filename.ext</Code>) and you can edit it
              with <strong>syntax highlighting</strong>. Finally, split the
              frame and select the Terminal, like you can see it in the
              screenshot. Execute <Code>python3 script.py</Code>,{" "}
              <Code>bash -f script.sh</Code>, ... to run it.{" "}
            </Paragraph>
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
            <Paragraph>
              Many <strong>popular applications</strong> are included in CoCalc:{" "}
              <A href="https://git-scm.com/">Git</A> to interact with{" "}
              <A href="https://www.github.com">GitHub</A>,{" "}
              <A href="https://www.vim.org/">VIM</A>,{" "}
              <A href="https://www.gnu.org/software/emacs/">Emacs</A>, various
              programming shells like <A href="https://ipython.org/">IPython</A>
              , <A href="https://www.r-project.org/">R</A>,{" "}
              <A href="https://www.gnu.org/software/octave/index">Octave</A> and{" "}
              <A href="https://www.sagemath.org/">SageMath</A>.
            </Paragraph>
            <Paragraph>
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
            </Paragraph>
            <Paragraph>
              Look at our{" "}
              <strong>
                <A href="/software/executables">list of executables</A>
              </strong>{" "}
              to check what is available!{" "}
            </Paragraph>
          </Info>

          <Snapshots />

          <Comparison
            name="terminal"
            disclaimer
            title={
              <Title level={2} style={{ textAlign: "center" }}>
                <Icon name="bolt" /> Terminals in CoCalc versus the competition
              </Title>
            }
          />

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
