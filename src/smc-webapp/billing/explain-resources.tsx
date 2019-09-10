import { Col, Row } from "react-bootstrap";
import { Component, React, Rendered } from "../app-framework";
import { Space } from "../r_misc/space";
const {
  HelpEmailLink,
  PolicyPricingPageUrl,
  SiteName
} = require("../customize");
import { ProjectQuotaFreeTable } from "./project-quota-free-table";
import { ProjectQuotaBoundsTable } from "./project-quota-bounds-table";

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
        <h4>Table of content</h4>
        <ul>
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
          <li>
            <b>
              <a href="#faq">FAQ</a>
            </b>
            : frequently asked questions
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
              ) : (
                undefined
              )}
              if anything is unclear to you, or you just have a quick question
              and do not want to wade through all the text below.
            </div>
            <Space />

            {this.render_toc()}

            <a id="projects" />
            <h4>Projects</h4>
            <div>
              Your work on <SiteName /> happens inside <em>projects</em>. You
              may create any number of independent projects. They form your
              personal workspaces, where you privately store your files,
              computational worksheets, and data. You typically run computations
              through a web browser, either via a worksheet, notebook, or by
              executing a program in a terminal (you can also ssh into any
              project). You can also invite collaborators to work with you
              inside a project, and you can explicitly make files or directories
              publicly available to everybody.
            </div>
            <Space />

            <h4>Shared Resources</h4>
            <div>
              Each project runs on a server, where it shares disk space, CPU,
              and RAM with other projects. Initially, projects run with default
              quotas on heavily used machines that are rebooted frequently. You
              can upgrade any quota on any project on which you collaborate, and
              you can move projects to faster very stable{" "}
              <em>members-only computers</em>, where there is much less
              competition for resources.
            </div>
            <Space />

            <h4>Quota upgrades</h4>
            <div>
              By purchasing one or more of our subscriptions, you receive a
              certain amount of <em>quota upgrades</em>.
              <ul style={{ paddingLeft: "20px" }}>
                <li>
                  You can upgrade the quotas on any of your projects up to the
                  total amount given by your subscription(s) and the upper
                  limits per project.
                </li>
                <li>
                  Project collaborators can collectively contribute to the same
                  project, in order to increase the quotas of their common
                  project &mdash; these contributions add together to benefit
                  all project collaborators equally.
                </li>
                <li>
                  You can remove your contributions to any project at any time.
                </li>
                <li>
                  You may also purchase multiple plans more than once, in order
                  to increase the total amount of upgrades available to you.
                </li>
              </ul>
            </div>
            <Space />
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
    return (
      <div>
        <a id="dedicated" />
        <h4>Dedicated resources</h4>
        You may also rent dedicated computers. Projects on such a machine of
        your choice get full use of the hard disk, CPU and RAM, and do{" "}
        <em>not</em> have to compete with other users for resources. We have not
        fully automated purchase of dedicated computers yet, so please contact
        us at <HelpEmailLink /> if you need a dedicated machine.
      </div>
    );
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
