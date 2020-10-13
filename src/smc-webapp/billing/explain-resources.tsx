/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "react-bootstrap";
import { React } from "../app-framework";
import { Space } from "../r_misc/space";
import { A } from "../r_misc/A";
const {
  HelpEmailLink,
  PolicyPricingPageUrl,
  SiteName,
} = require("../customize");
import { ProjectQuotaFreeTable } from "./project-quota-free-table";
import { ProjectQuotaBoundsTable } from "./project-quota-bounds-table";
import { DEDICATED_VM_TEXT } from "./dedicated-vm";
import { FAQ } from "./faq";
import { TITLE as COURSE_TITLE } from "./explain-course-licenses";
import { DOC_LICENSE_URL } from "./data";

interface Props {
  type: "shared" | "dedicated";
  is_static?: boolean;
}

export const ExplainResources: React.FC<Props> = (props: Props) => {
  const { type, is_static } = props;

  function render_toc() {
    if (!is_static) {
      return;
    }
    return (
      <>
        <h4>Table of contents</h4>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <b>
              <a href="#subscriptions">Service subscriptions</a>
            </b>
            : upgrade your projects
          </li>
          <li>
            <b>
              <a href="#courses">{COURSE_TITLE}</a>
            </b>
            : upgrade student projects for teaching a course
          </li>
          <li>
            <b>
              <a href="#dedicated">Dedicated VMs</a>
            </b>
            : a node in the cluster for large workloads
          </li>
          <li>
            <b>
              <a href="#onprem">On-Premises</a>
            </b>
            : run <SiteName /> on your own hardware
          </li>
        </ul>
        <Space />
      </>
    );
  }

  function render_shared() {
    return (
      <div>
        <Row>
          <Col md={8} sm={12}>
            <h4>Questions</h4>
            <div style={{ fontSize: "12pt" }}>
              Please immediately email us at <HelpEmailLink />,{" "}
              {!is_static ? (
                <span>
                  {" "}
                  click the Help button above or read our{" "}
                  <a
                    target="_blank"
                    href={`${PolicyPricingPageUrl}#faq`}
                    rel="noopener"
                  >
                    pricing FAQ
                  </a>{" "}
                </span>
              ) : undefined}
              if anything is unclear to you, you just have a quick question and
              do not want to wade through all the text below. Also, contact us
              if you need <b>enterprise support</b>, which includes customized
              course packages, modified terms of service, additional legal
              agreements, purchase orders, insurance and priority technical
              support.
            </div>
            <Space />

            <a id="projects" />
            <h4>Projects</h4>
            <div>
              Your work on <SiteName /> happens inside one or more{" "}
              <A href="https://doc.cocalc.com/project.html">projects</A>. They
              form your personal workspaces, where you privately store your
              files, computational worksheets, and data. You typically run
              computations through a web browser, either via a{" "}
              <A href="https://doc.cocalc.com/sagews.html">Sage Worksheet</A>,{" "}
              <A href="https://doc.cocalc.com/jupyter.html">Jupyter Notebook</A>
              , or by executing a program in a{" "}
              <A href="https://doc.cocalc.com/terminal.html">terminal</A>. You
              can also{" "}
              <A href="https://doc.cocalc.com/project-settings.html#add-new-collaborators">
                invite collaborators
              </A>{" "}
              to work with you inside a project, and you can explicitly make
              files or directories{" "}
              <A href="https://doc.cocalc.com/share.html">
                publicly available to everybody
              </A>
              .
            </div>
            <Space />

            <h4>Shared resources</h4>
            <div>
              Each project runs on a server, where it shares disk space, CPU,
              and RAM with other projects. Initially, you work in a{" "}
              <A href="https://doc.cocalc.com/trial.html">trial project</A>,
              which runs with default quotas on heavily used machines that are
              rebooted frequently. Upgrading to "member hosting" moves your
              project to a machine with higher-quality hosting and less
              competition for resources.
            </div>
            <Space />

            <h4>Upgrading projects</h4>
            <div>
              By purchasing one or more of our subscriptions or plans, you
              receive a certain amount of{" "}
              <A href="https://doc.cocalc.com/billing.html#quota-upgrades">
                quota upgrades
              </A>
              . Use these upgrades to improve hosting quality, enable internet
              access from within a project or increase quotas for CPU and RAM in
              order to work on larger problems and do more computations
              simultaneously. On top of that, your{" "}
              <HelpEmailLink text={"support questions"} /> are prioritized.
            </div>
            <div>
              All project collaborators <em>collectively contribute</em> to the
              same project &mdash; their contributions add together to benefit
              all project collaborators equally.
            </div>
            <Space />

            <h4>License Keys</h4>
            <div>
              <A href={DOC_LICENSE_URL}>
                License Keys
              </A>{" "}
              are applied to projects. One key upgrades up to certain number of{" "}
              <em>simultaneously running projects</em> with the given upgrade
              schema.
            </div>
            <div>The following parameters determine the price:</div>
            <ul style={{ paddingLeft: "20px" }}>
              <li>The number of projects</li>
              <li>If you qualify for an academic discount</li>
              <li>
                Upgrade schema per project: a small 1 GB memory / 1 shared CPU
                upgrade is fine for basic calculations, but we find that many
                data and computational science projects run better with
                additional RAM and CPU.
              </li>
              <li>
                Duration: monthly/yearly subscription or explicit start and end
                dates.
              </li>
              <li>
                Purchase method: online purchasing vs. retail
                (invoicing/billing/...)
              </li>
            </ul>
            <Space />

            {render_toc()}

            <Space />
            <h4>More information</h4>
            <FAQ />
          </Col>
          <Col md={4} sm={12}>
            <Row>
              <Col md={12} sm={6}>
                <ProjectQuotaFreeTable />
              </Col>
              <Col md={12} sm={6}>
                <ProjectQuotaBoundsTable />
              </Col>
            </Row>
          </Col>
        </Row>
      </div>
    );
  }

  function render_dedicated() {
    return DEDICATED_VM_TEXT;
  }

  switch (type) {
    case "shared":
      return render_shared();
    case "dedicated":
      return render_dedicated();
    default:
      throw Error(`unknown type ${type}`);
  }
};
