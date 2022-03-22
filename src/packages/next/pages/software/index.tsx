import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import IndexList, { DataSource } from "components/landing/index-list";

import executablesScreenshot from "public/software/executables.png";
import pythonScreenshot from "/public/features/frame-editor-python.png";
import RJupyter from "/public/features/cocalc-r-jupyter.png";
import JuliaJupyter from "/public/software/julia-jupyter.png";
import octaveJupyter from "/public/features/cocalc-octave-jupyter-20200511.png";
import A from "components/misc/A";

export const STYLE_PAGE: React.CSSProperties = {
  maxWidth: "900px",
  margin: "15px auto",
  padding: "15px",
  backgroundColor: "white",
} as const;

// STYLE_PAGE should have a max width of 1200px
export const STYLE_PAGE_WIDE: React.CSSProperties = {
  ...STYLE_PAGE,
  maxWidth: "1200px",
} as const;

const dataSource = [
  {
    link: "/software/executables",
    title: "Executables",
    logo: "laptop",
    image: executablesScreenshot,
    description: (
      <>
        CoCalc comes pre-installed with{" "}
        <A href="/software/executables">thousands of programs</A> that you can
        run from the terminal or in an X11 environment, or call from your
        notebooks or scripts.
      </>
    ),
  },
  {
    link: "/software/python",
    title: "Python Libraries",
    logo: "python",
    image: pythonScreenshot,
    description: (
      <>
        CoCalc offers a large number of{" "}
        <A href="/software/python">Python libraries preinstalled</A> system
        wide, in Anaconda, and in several versions of Sage.
      </>
    ),
  },
  {
    link: "/software/r",
    title: "R Statistical Software Packages",
    logo: "r",
    image: RJupyter,
    description: (
      <>
        CoCalc maintains an extensive set of{" "}
        <A href="/software/r">R packages</A>
      </>
    ),
  },
  {
    link: "/software/julia",
    title: "Julia Packages",
    logo: "julia",
    image: JuliaJupyter,
    description: (
      <>
        CoCalc regularly updates Julia and installs{" "}
        <A href="/software/julia">many common Julia packages</A>.
      </>
    ),
  },
  {
    link: "/software/octave",
    title: "Octave Packages",
    logo: "octave",
    image: octaveJupyter,
    description: (
      <>
        There are several <A href="/software/octave">Octave packages</A> that
        are preinstalled.
      </>
    ),
  },
] as DataSource;

export default function Software({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Software" />
      <Header page="software" />
      <IndexList
        title="Available Software"
        description="These pages contain information about available software on CoCalc."
        dataSource={dataSource}
      />
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
