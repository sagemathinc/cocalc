/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Code from "components/landing/code";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import Snapshots from "components/landing/snapshots";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import { Paragraph, Title } from "components/misc";
import jupyterBash from "public/features/cocalc-jupyter-bash.png";
import shellScript from "public/features/cocalc-shell-script-run.png";
import terminalCollab from "public/features/cocalc-terminal-collab.gif";
import logo from "public/features/linux-logo.svg";
import postgres from "public/features/terminal-jupyter-postgresql.png";

export default function Linux({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Online Linux Environment" />
      <Layout>
        <Header page="features" subPage="linux"  />
        <Layout.Content>
          <Content
            landing
            startup={"Linux"}
            body={logo}
            title={"Online Linux Environment"}
            subtitle={
              "Learn Linux and Bash Scripting without messing up your own computer."
            }
            subtitleBelow={true}
            image={shellScript}
            alt={"Running a bash script to count in Linux"}
          />

          <FullLinuxTerminal />

          <SignIn startup="Linux" />

          <Info
            title="Realtime collaboration"
            icon="users"
            image={terminalCollab}
            anchor="a-real-time"
            alt="Video showing using vim collaboratively with chat"
          >
            <Paragraph>
              Terminals in CoCalc are represented by files with the extension{" "}
              <code>.term</code>. The same terminal can be opened by two or more
              people simultaneous. Both see the same view, which adaptively
              resizes to a common size.
            </Paragraph>
            <Paragraph>
              Additionally, you can open a{" "}
              <A href="https://doc.cocalc.com/chat.html">chat</A> panel to
              exchange thoughts and ideas.
            </Paragraph>
            <Paragraph>
              This is ideal for getting advice from a colleague or{" "}
              <A href="https://doc.cocalc.com/teaching-interactions.html">
                helping one of your students
              </A>
              .
            </Paragraph>
          </Info>

          <Info.Heading
            description={
              <>
                The following are some additional specific features of Linux
                Terminals in CoCalc.
                <br />
                There is also more{" "}
                <A href="https://doc.cocalc.com/terminal.html">
                  comprehensive documentation
                </A>
                .
              </>
            }
          >
            Feature Overview
          </Info.Heading>

          <Info
            title={
              <>
                Run{" "}
                <A href="https://en.wikipedia.org/wiki/Bash_(Unix_shell)">
                  Bash
                </A>{" "}
                scripts
              </>
            }
            icon="terminal"
            image={shellScript}
            caption={
              <>
                Bash <Code>script.sh</Code> file (left),{" "}
                <Code>bash -f script.sh</Code> to run (right)
              </>
            }
            anchor="a-shell-script"
            alt="Running a bash script to count in Linux"
          >
            <Paragraph>
              CoCalc's{" "}
              <A href="https://doc.cocalc.com/frame-editor.html">code editor</A>{" "}
              supports{" "}
              <strong>
                editing a{" "}
                <A href="https://www.gnu.org/software/bash/">bash script</A>{" "}
                side-by-side with a{" "}
                <A href="https://doc.cocalc.com/terminal.html">terminal</A>
              </strong>
              .
            </Paragraph>
            <Paragraph>
              To get started, create a script file ending with <Code>.sh</Code>,
              for example <Code>script.sh</Code>. Opening that file presents you
              an editor with <strong>syntax highlighting</strong>. Then click
              the <Code>Shell</Code> button to open up a Terminal and type in{" "}
              <Code>{"bash -f script.sh"}</Code> to run your script.
            </Paragraph>
            <Paragraph>
              This helps you learning Bash by exploring its commands directly in
              your browser and immediately experiencing the results.
            </Paragraph>
          </Info>

          <Info
            title="Jupyter Bash kernel"
            image={jupyterBash}
            icon="ipynb"
            anchor="a-jupyter"
            alt="Using Bash via a Jupyter notebook"
          >
            <Paragraph>
              Are you looking for something beyond a terminal or editing shell
              scripts? CoCalc also offers{" "}
              <strong>
                <A href="/features/jupyter-notebook">Jupyter Notebooks</A>{" "}
                running the{" "}
                <A href="https://github.com/takluyver/bash_kernel">
                  bash kernel
                </A>
              </strong>
              .
            </Paragraph>
            <Paragraph>
              This is similar to working with a terminal, but it saves all the
              input you typed and the corresponding output in "cells". That
              helps you with learning Linux commands, because it makes it easier
              to edit the code input or compare different outcomes of similar
              code. Besides that, you can also take notes between code cells.
            </Paragraph>
          </Info>

          <Snapshots>
            <Paragraph>
              The CoCalc terminal is ideal for{" "}
              <strong>teaching and learning Linux</strong>, because when you
              make a mistake, it has your back!
            </Paragraph>
            <Paragraph>
              Everything runs remotely on CoCalc's servers. This means you do
              not have to worry about messing up your own computer, dealing with
              setup and installation issues yourself, or fear losing or
              corrupting files on your computer.
            </Paragraph>
          </Snapshots>

          <Info
            title="Databases (PostgreSQL, MySQL, SQLite)"
            image={postgres}
            icon="database"
            anchor="a-database"
            wide
            alt="Using a PostgreSQL database via a terminal and a Jupyter notebook"
          >
            <Paragraph>
              <strong>
                CoCalc supports running various databases inside a project.
              </strong>{" "}
              They run in the same protected networking environment as all other
              processes in a project. This is ideal for{" "}
              <strong>learning SQL</strong> or{" "}
              <strong>persistently storing data</strong> as a result of your
              computations.
            </Paragraph>
            <Paragraph>
              <strong>PostgreSQL</strong>: read{" "}
              <A href="https://doc.cocalc.com/howto/postgresql.html">
                our guide
              </A>{" "}
              to get started.
            </Paragraph>
            <Paragraph>
              Besides{" "}
              <A href="https://https://www.postgresql.org/">PostgreSQL</A>,
              CoCalc also supports <A href="https://www.mysql.com/">MySQL</A>{" "}
              and <A href="https://sqlite.org">SQLite</A>.
            </Paragraph>
            <Paragraph>
              To interact with the databases, CoCalc{" "}
              <strong>pre-installs suitable Python and R libraries</strong> for
              your convenience.
            </Paragraph>
            <Paragraph>
              In the screenshot, you can see how a PostgreSQL database was setup
              and started in the first terminal. In the second terminal,{" "}
              <Code>psql</Code> is used to connect to it and create a table and
              insert data. Finally, the{" "}
              <A href="/features/jupyter-notebook">Jupyter Notebook</A> on the
              left connects via the{" "}
              <A href="http://initd.org/psycopg/docs/">psycopg2</A> library and
              issues a query to the database!
            </Paragraph>
          </Info>
          <SignIn startup="Linux" />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

export function FullLinuxTerminal() {
  return (
    <>
      <Pitch
        col1={
          <>
            <Title level={2}>Full Linux Terminal</Title>
            <Paragraph>
              <strong>
                CoCalc offers a full, collaborative, real-time synchronized{" "}
                <A href="https://en.wikipedia.org/wiki/Linux">Linux</A>{" "}
                <A href="https://en.wikipedia.org/wiki/Command-line_interface">
                  Command Line Terminal
                </A>{" "}
                in your browser.
              </strong>
            </Paragraph>
            <Paragraph>
              Take a look at our{" "}
              <strong>
                <A href="https://doc.cocalc.com/terminal.html">
                  terminal documentation
                </A>
              </strong>{" "}
              to learn more about it!
            </Paragraph>
            <Paragraph>
              Browse the{" "}
              <strong>
                <A href="/software/executables">installed software</A>
              </strong>{" "}
              in CoCalc.
            </Paragraph>
            <Paragraph>
              CoCalc is made for{" "}
              <strong>
                <A href="/features/teaching">teaching a course</A>
              </strong>
              : students just have to sign in to get started!{" "}
            </Paragraph>
          </>
        }
        col2={
          <>
            <Title level={2}>Benefits of working 100% online</Title>
            <Paragraph>
              <ul>
                <li>
                  You no longer have to <strong>install and maintain</strong>{" "}
                  any software.
                </li>
                <li>
                  It is possible for multiple people to{" "}
                  <strong>
                    collaboratively use the same terminal in realtime
                  </strong>
                  .
                </li>
                <li>You can also edit and run shell script files.</li>
                <li>
                  Use{" "}
                  <strong>
                    <A href="https://doc.cocalc.com/chat.html">chat</A>
                  </strong>{" "}
                  next to the Terminal to discuss your commands with others.
                </li>
                <li>
                  <strong>Automatic backup</strong> keeps your files safe!
                </li>
                <li>
                  You can <strong>copy and paste</strong> between your local
                  desktop and the online terminal.
                </li>
              </ul>
            </Paragraph>
          </>
        }
      />

      <Pitch
        ext="sh"
        col1={
          <>
            <Title level={2}>
              <Icon name="user-check" /> What you <strong>can</strong> do ...
            </Title>
            <Paragraph>
              <ul>
                <li>Learn Bash scripting</li>
                <li>Learn how to use the Linux command line</li>
                <li>
                  Run scripts written in{" "}
                  <strong>Python, R, PHP, Ruby, Go, Perl, Nodejs </strong> etc.
                </li>
                <li>
                  Compile programs written in{" "}
                  <strong>
                    C/C++, Java, Rust, Assembly, Fortran, Julia, Zig, Haskell,
                  </strong>{" "}
                  etc.
                </li>
                <li>Process and store datafiles</li>
                <li>Collaborate</li>
                <li>Use graphical X11 applications</li>
              </ul>
            </Paragraph>
          </>
        }
        col2={
          <>
            <Title level={2}>
              <Icon name="user-slash" /> ... what you <strong>cannot</strong>{" "}
              do.
            </Title>
            <Paragraph>
              <ul>
                <li>
                  <strong>
                    <code>Root</code>
                  </strong>
                  : due to how CoCalc works, you cannot have root rights.
                  However, there is a wealth of software{" "}
                  <A href="/software">already installed</A>, including both
                  system utilities and packages for specific language
                  environments. Regarding Python, R, Nodejs, and Julia
                  environments, you can{" "}
                  <A href="https://doc.cocalc.com/howto/index.html">
                    install additional packages in your project
                  </A>
                  . If something is missing,{" "}
                  <A href="mailto:help@cocalc.com">please tell us</A>.
                </li>
                <li>
                  <strong>
                    Communicate with the Internet without buying a license
                  </strong>
                  : if you want to run code to download data from another server
                  or checkout a Git repository – or just want to support CoCalc
                  – you need a{" "}
                  <A href="https://doc.cocalc.com/licenses.html">license</A>{" "}
                  applied to your project. Learn more about the{" "}
                  <A href="https://doc.cocalc.com/trial.html">Trial Projects</A>{" "}
                  that you can use for free.
                </li>
                <li>
                  <strong>Port forwards:</strong> you cannot forward arbitrary
                  ports over ssh to your local computer. (You{" "}
                  <strong>CAN</strong>{" "}
                  <A href="https://doc.cocalc.com/project-settings.html#ssh-keys">
                    ssh into your project
                  </A>
                  .)
                </li>
              </ul>
            </Paragraph>
          </>
        }
      />
    </>
  );
}
