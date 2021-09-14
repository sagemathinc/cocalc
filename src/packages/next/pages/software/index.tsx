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

const dataSource = [
  {
    link: "/software/executables",
    title: "Executables",
    logo: "laptop",
    image: executablesScreenshot,
    description: (
      <>
        CoCalc comes pre-installed with thousands of programs that you can run
        from the terminal or in an X11 environment, or call from your notebooks
        or scripts.
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
        CoCalc offers a large number of Python libraries preinstalled system
        wide, in Anaconda, and in several versions of Sage.
      </>
    ),
  },
  {
    link: "/software/r",
    title: "R Statistical Software Packages",
    logo: "r",
    image: RJupyter,
    description: <>CoCalc maintains an extensive set of R packages</>,
  },
  {
    link: "/software/julia",
    title: "Julia Libraries",
    logo: "julia",
    image: JuliaJupyter,
    description: (
      <>CoCalc regularly updates Julia and installs many common packages.</>
    ),
  },
  {
    link: "/software/octave",
    title: "Octave Packages",
    logo: "octave",
    image: octaveJupyter,
    description: <>There are several Octave packages that are preinstalled.</>,
  },
] as DataSource;

export default function Software({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="CoCalc Software" />
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

export async function getServerSideProps() {
  return await withCustomize();
}
