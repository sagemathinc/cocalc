

import { Card } from "antd";
import { React } from "../../app-framework";
import { Icon } from "../../r_misc";
import { SITE_NAME, LIVE_DEMO_REQUEST } from "smc-util/theme";

export function HelpBox() {
  return (
    <Card
      title={
        <>
          <Icon name="question-circle" /> Help
        </>
      }
    >
      <span style={{ color: "#666", fontSize: "11pt" }}>
        <ul>
          <li>
            <a href={LIVE_DEMO_REQUEST} target={"_blank"} rel={"noopener"}>
              Request a live demo <Icon name="external-link" />
            </a>{" "}
            (with a {SITE_NAME} specialist)
          </li>
          <li>
            <a
              href={"https://doc.cocalc.com/teaching-instructors.html"}
              target={"_blank"}
              rel={"noopener"}
            >
              Instructor Guide for using CoCalc for teaching{" "}
              <Icon name="external-link" />
            </a>
          </li>
          <li>
            <a
              href="http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/"
              target="_blank"
              rel={"noopener"}
            >
              Grading courses <Icon name="external-link" />
            </a>
          </li>
          <li>
            <a
              href="http://www.beezers.org/blog/bb/2016/01/pennies-a-day-for-sagemathcloud/"
              target="_blank"
              rel={"noopener"}
            >
              Course plans and teaching experiences{" "}
              <Icon name="external-link" />
            </a>
          </li>
          <li>
            <a
              href="http://blog.ouseful.info/2015/11/24/course-management-and-collaborative-jupyter-notebooks-via-sagemathcloud/"
              target="_blank"
              rel={"noopener"}
            >
              Course management and collaborative Jupyter Notebooks{" "}
              <Icon name="external-link" />
            </a>
          </li>
        </ul>
      </span>
    </Card>
  );
}
