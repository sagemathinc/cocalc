/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout, Radio } from "antd";

import {
  LanguageName,
  SOFTWARE_ENV_DEFAULT,
  SOFTWARE_ENV_NAMES,
} from "@cocalc/util/consts/software-envs";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import IndexList, { DataSource } from "components/landing/index-list";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

// Images
import juliaLogo from "public/features/julia-logo.svg";
import sageScreenshot from "public/features/sage-worksheet.png";
import executablesScreenshot from "public/software/executables.png";
import octaveJupyter from "/public/features/cocalc-octave-jupyter-20200511.png";
import RJupyter from "/public/features/cocalc-r-jupyter.png";
import pythonScreenshot from "/public/features/frame-editor-python.png";
import octaveLogo from "/public/features/octave-logo.svg";
import PythonLogo from "/public/features/python-logo.svg";
import Rlogo from "/public/features/r-logo.svg";
import sageLogo from "/public/features/sage-sticker-1x1_inch-small.png";
import JuliaJupyter from "/public/software/julia-jupyter.png";

export const STYLE_PAGE: React.CSSProperties = {
  maxWidth: MAX_WIDTH,
  margin: "0 auto",
  padding: "40px 15px 0 15px",
  backgroundColor: "white",
} as const;

// STYLE_PAGE should have a max width of 1200px
export const STYLE_PAGE_WIDE: React.CSSProperties = {
  ...STYLE_PAGE,
  maxWidth: "1200px",
} as const;

const LINKS: { [lang in LanguageName | "executables"]: string } = {
  executables: `/software/executables/${SOFTWARE_ENV_DEFAULT}`,
  python: `/software/python/${SOFTWARE_ENV_DEFAULT}`,
  R: `/software/r/${SOFTWARE_ENV_DEFAULT}`,
  julia: `/software/julia/${SOFTWARE_ENV_DEFAULT}`,
  octave: `/software/octave/${SOFTWARE_ENV_DEFAULT}`,
  sagemath: `/software/sagemath/${SOFTWARE_ENV_DEFAULT}`,
} as const;

function renderSoftwareEnvLinks(lang: LanguageName | "executables") {
  return (
    <Paragraph>
      <Radio.Group
        optionType="button"
        size="small"
        value={SOFTWARE_ENV_DEFAULT}
        buttonStyle="solid"
      >
        {SOFTWARE_ENV_NAMES.map((name) => {
          // toLowerCase is necessary for R → r
          const href = `/software/${lang.toLowerCase()}/${name}`;
          return (
            <Radio.Button
              key={name}
              value={name}
              onClick={() => (window.location.href = href)}
            >
              {name}
            </Radio.Button>
          );
        })}
      </Radio.Group>
    </Paragraph>
  );
}

const dataSource: DataSource = [
  {
    link: LINKS.executables,
    title: "Executables",
    logo: "laptop",
    image: executablesScreenshot,
    description: (
      <>
        <Paragraph>
          CoCalc comes pre-installed with{" "}
          <A href={LINKS.executables}>thousands of programs</A> that you can run
          from the terminal or in an X11 environment, or call from your
          notebooks or scripts.
        </Paragraph>
        {renderSoftwareEnvLinks("executables")}
      </>
    ),
  },
  {
    link: LINKS.python,
    title: "Python Libraries",
    logo: PythonLogo,
    logoBackground: "white",
    image: pythonScreenshot,
    description: (
      <>
        <Paragraph>
          CoCalc offers a large number of{" "}
          <A href={LINKS.python}>Python libraries preinstalled</A> system wide,
          in Anaconda, and in several versions of Sage.
        </Paragraph>
        {renderSoftwareEnvLinks("python")}
      </>
    ),
  },
  {
    link: LINKS.sagemath,
    title: "SageMath Packages",
    logo: sageLogo,
    logoBackground: "white",
    image: sageScreenshot,
    description: (
      <>
        <Paragraph>
          CoCalc provides <A href={LINKS.sagemath}>SageMath environments</A>{" "}
          with additional preinstalled packages.
        </Paragraph>
        {renderSoftwareEnvLinks("sagemath")}
      </>
    ),
  },
  {
    link: LINKS.R,
    title: "R Statistical Software Packages",
    logo: Rlogo,
    logoBackground: "white",
    image: RJupyter,
    description: (
      <>
        <Paragraph>
          CoCalc maintains an extensive set of <A href={LINKS.R}>R packages</A>
        </Paragraph>
        {renderSoftwareEnvLinks("R")}
      </>
    ),
  },
  {
    link: LINKS.julia,
    title: "Julia Packages",
    logo: juliaLogo,
    logoBackground: "white",
    image: JuliaJupyter,
    description: (
      <>
        <Paragraph>
          CoCalc regularly updates Julia and installs{" "}
          <A href={LINKS.julia}>many common Julia packages</A>.
        </Paragraph>
        {renderSoftwareEnvLinks("julia")}
      </>
    ),
  },
  {
    link: LINKS.octave,
    title: "Octave Packages",
    logo: octaveLogo,
    logoBackground: "white",
    image: octaveJupyter,
    description: (
      <>
        <Paragraph>
          There are several <A href={LINKS.octave}>Octave packages</A> that are
          preinstalled.
        </Paragraph>
        {renderSoftwareEnvLinks("octave")}
      </>
    ),
  },
];

export default function Software({ customize }) {
  const description = (
    <>
      <p>These pages contain information about available software on CoCalc.</p>
      <p>
        By default, projects are running in an environment based on{" "}
        <A href="https://en.wikipedia.org/wiki/Ubuntu">
          Ubuntu {SOFTWARE_ENV_DEFAULT}
        </A>
        , but there are also {SOFTWARE_ENV_NAMES.length - 1} other variants
        available. The default variant is actively maintained and regularly
        updated – others are for testing or are deprected. The reason to pick an
        older environment is backwards compatibility with older software,
        running an older project of yours, or for historic purposes.
      </p>
    </>
  );

  return (
    <Customize value={customize}>
      <Head title="Software" />
      <Layout>
        <Header page="software" />
        <IndexList
          title="Available Software"
          description={description}
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
