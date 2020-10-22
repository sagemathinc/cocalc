/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { wrap } from "./course-panel-wrapper";

import { AssignmentsPanel } from "../../course/assignments/assignments-panel";
export const Assignments = wrap(AssignmentsPanel);

import { StudentsPanel } from "../../course/students/students-panel";
export const Students = wrap(StudentsPanel);

import { HandoutsPanel } from "../../course/handouts/handouts-panel";
export const Handouts = wrap(HandoutsPanel);

import { ConfigurationPanel } from "../../course/configuration/configuration-panel";
export const Configuration = wrap(ConfigurationPanel);

import { SharedProjectPanel } from "../../course/shared-project/shared-project-panel";
export const SharedProject = wrap(SharedProjectPanel);

import { GroupingsPanel } from "../../course/groupings/groupings-panel";
export const Groupings = wrap(GroupingsPanel);
