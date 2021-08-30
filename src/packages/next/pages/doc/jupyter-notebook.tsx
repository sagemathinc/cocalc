import Link from "next/link";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Publishing from "components/landing/publishing";
import Head from "components/landing/head";

export default function LatexEditor({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Online Jupyter Notebooks" />
      <Layout>
        <Header />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={"Jupyter"}
              logo={"jupyter-logo.svg"}
              title={"Online Jupyter Notebooks"}
              subtitle={
                "CoCalc's own collaborative, fully compatible and supercharged notebooks."
              }
              image={"cocalc-jupyter2-20170508.png"}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h2>
                  No software setup: <small>100% online</small>
                </h2>
                <p>
                  CoCalc is an online web service where you can{" "}
                  <strong>
                    run <A href="http://jupyter.org/">Jupyter notebooks</A>{" "}
                    right inside your browser
                  </strong>
                  . You can privately share your notebook with your{" "}
                  <A href="https://doc.cocalc.com/project-settings.html#about-collaborators">
                    project collaborators
                  </A>{" "}
                  – all changes are <strong>synchronized in real-time</strong>.
                </p>
                <p>
                  You no longer have to worry about setting up your Python
                  environment, installing/updating/maintaining your libraries,
                  or backing up files. CoCalc manages everything for you!{" "}
                </p>
              </div>
            }
            col2={
              <div>
                <h2>Jupyter Notebooks made for teaching!</h2>
                <ul>
                  <li>
                    A sophisticated{" "}
                    <strong>
                      <Link href="/doc/teaching">
                        <a>course management system</a>
                      </Link>
                    </strong>{" "}
                    keeps track of all notebooks of all students. It manages
                    distributing and collecting files as well as grading.
                  </li>
                  <li>
                    CoCalc's Jupyter Notebooks fully support{" "}
                    <strong>automatic grading</strong>! The teacher's notebook
                    contains exercise cells for students and test cells, some of
                    which students can also run to get immediate feedback. Once
                    collected, you tell CoCalc to automatically run the full
                    test suite across all student notebooks and tabulate the
                    results. Learn more about{" "}
                    <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                      NBGrader
                    </A>
                    .
                  </li>
                </ul>

                <p>
                  CoCalc supports many kernels right out of the box: several
                  Python environments,{" "}
                  <A href="http://www.sagemath.org/">SageMath</A>,{" "}
                  <A href="http://www.r-project.org/">R Statistical Software</A>
                  , <A href="http://julialang.org">Julia</A> and many more.{" "}
                </p>
              </div>
            }
            ext="ipynb"
          />

          <SignIn startup="Jupyter" />

          <Info
            anchor="a-environments"
            icon="tex-file"
            title={<>Managed Jupyter environments</>}
            image="latex-custom-command-02.png"
          >
            <p>
              CoCalc makes sure that your desired Jupyter engine is available
              and ready to use. You can choose between{" "}
              <strong>
                <A href="http://www.tug.org/applications/pdftex/">PDF Latex</A>
              </strong>
              ,{" "}
              <strong>
                <A href="http://xetex.sourceforge.net/">XeLaTeX</A>
              </strong>{" "}
              or{" "}
              <strong>
                <A href="http://www.luatex.org/">LuaTeX</A>
              </strong>
              .
            </p>
            <p>
              Many packages and utilities like{" "}
              <A href="https://sourceforge.net/projects/pgf/">PGF and TikZ</A>{" "}
              are pre-installed.
            </p>
            <p>
              Behind the scenes,{" "}
              <A href="http://mg.readthedocs.io/latexmk.html">LatexMK</A> is
              configured to manage the compilation process, which means that you
              do not have to bother too much about any additional configuration.
            </p>
            <p>
              Besides that, it is possible to{" "}
              <strong>fully customize the compilation command</strong>. This
              means you can bring your own shell script or Makefile!{" "}
            </p>
          </Info>

          <Publishing />
          <SignIn startup="Jupyter" />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
