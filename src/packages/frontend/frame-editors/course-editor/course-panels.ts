/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { wrap } from "./course-panel-wrapper";
import { AssignmentsPanel } from "@cocalc/frontend/course/assignments/assignments-panel";
import { ConfigurationPanel } from "@cocalc/frontend/course/configuration/configuration-panel";
import { HandoutsPanel } from "@cocalc/frontend/course/handouts/handouts-panel";
import { SharedProjectPanel } from "@cocalc/frontend/course/shared-project/shared-project-panel";
import { StudentsPanel } from "@cocalc/frontend/course/students/students-panel";

export const Assignments = wrap(AssignmentsPanel);
export const Students = wrap(StudentsPanel);
export const Handouts = wrap(HandoutsPanel);
export const Configuration = wrap(ConfigurationPanel);
export const SharedProject = wrap(SharedProjectPanel);
