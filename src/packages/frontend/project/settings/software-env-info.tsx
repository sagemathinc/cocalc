/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore descr disp

import { join } from "path";
import { FormattedMessage } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Paragraph } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export function SoftwareEnvironmentInformation() {
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");

  return (
    <>
      <Paragraph>
        <FormattedMessage
          id="project.settings.compute-image-selector.software-env-info"
          defaultMessage={`A software environment provides all the software, this project can make use of.
                If you need additional software, you can either install it in the project or contact support.
                Learn about <A1>installing Python packages</A1>,
                <A2>Python Jupyter Kernel</A2>,
                <A3>R Packages</A3> and <A4>Julia packages</A4>.`}
          values={{
            A1: (c) => (
              <A href={"https://doc.cocalc.com/howto/install-python-lib.html"}>
                {c}
              </A>
            ),
            A2: (c) => (
              <A
                href={"https://doc.cocalc.com/howto/custom-jupyter-kernel.html"}
              >
                {c}
              </A>
            ),
            A3: (c) => (
              <A href={"https://doc.cocalc.com/howto/install-r-package.html"}>
                {c}
              </A>
            ),
            A4: (c) => (
              <A
                href={"https://doc.cocalc.com/howto/install-julia-package.html"}
              >
                {c}
              </A>
            ),
          }}
        />
      </Paragraph>
      {isCoCalcCom ? (
        <Paragraph>
          <FormattedMessage
            id="project.settings.compute-image-selector.software-env-info.cocalc_com"
            defaultMessage={`Learn more about specific environments in the <A1>software inventory</A1>.
                  Snapshots of what has been available at a specific point in time
                  are available for each line of environments.
                  Only the current default environment is updated regularly.`}
            values={{
              A1: (c) => <A href={join(appBasePath, "software")}>{c}</A>,
            }}
          />
        </Paragraph>
      ) : undefined}
    </>
  );
}
