//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016 -- 2017, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//#############################################################################

import { React } from "../app-framework";
import { Card } from "cocalc-ui";
import { Icon } from "../r_misc";
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
