import { Col, Row } from "react-bootstrap";
import { Component, React, Rendered } from "../app-framework";
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

interface Props {
  type: "shared" | "dedicated";
  is_static?: boolean;
}

export class ExplainResources extends Component<Props> {
  private render_toc(): Rendered {
    if (!this.props.is_static) {
      return;
    }
    return (
      <>
        <h4>Table of contents</h4>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <b>
              <a href="#subscriptions">Personal subscriptions</a>
            </b>
            : upgrade your projects
          </li>
          <li>
            <b>
              <a href="#courses">Course packages</a>
            </b>
            : upgrade student projects for teaching a course
          </li>
          <li>
            <b>
              <a href="#dedicated">Dedicated VMs</a>
            </b>
            : a node in the cluster for large workloads
          </li>
        </ul>
        <Space />
      </>
    );
  }

  private render_shared(): Rendered {
    return (
      <div>
        <Row>
          <Col md={8} sm={12}>
            <h4>Questions</h4>
            <div style={{ fontSize: "12pt" }}>
              Please immediately email us at <HelpEmailLink />,{" "}
              {!this.props.is_static ? (
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

            <h4>Quota upgrades</h4>
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
            <ul style={{ paddingLeft: "20px" }}>
              <li>
                These upgrades are applied on top of the project{"'"}s free
                quotas.
              </li>
              <li>
                You can upgrade the quotas up to the total amount given by your
                subscription(s) and the upper limits per project.
              </li>
              <li>
                Project collaborators can <em>collectively contribute</em> to
                the same project, in order to increase the quotas of their
                common project &mdash; these contributions add together to
                benefit all project collaborators equally.
              </li>
              <li>
                You may also purchase any plans <em>more than once</em>, in
                order to increase the total amount of upgrades available to you.
              </li>
            </ul>
            <Space />

            {this.render_toc()}

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

  private render_dedicated(): Rendered {
    return DEDICATED_VM_TEXT;
  }

  public render(): Rendered {
    switch (this.props.type) {
      case "shared":
        return this.render_shared();
      case "dedicated":
        return this.render_dedicated();
      default:
        throw Error(`unknown type ${this.props.type}`);
    }
  }
}
