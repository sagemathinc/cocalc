/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { IconName } from "@cocalc/frontend/components/icon";
import { Uptime } from "@cocalc/util/consts/site-license";
import { Typography } from "antd";
import A from "components/misc/A";
import { ReactNode } from "react";
const { Text } = Typography;

export type Presets =
  | "standard"
  | "student"
  | "student+"
  | "instructor"
  | "research"
  | "development"
  | "budget";

export interface Preset {
  icon?: IconName;
  name: string;
  descr: ReactNode;
  details?: ReactNode;
  cpu: number;
  ram: number;
  disk: number;
  uptime?: Uptime;
  member?: boolean;
}

type PresetEntries = {
  [key in Presets]: Preset;
};

// some constants to keep text and preset in sync
const STANDARD_CPU = 1;
const STANDARD_RAM = 2;
const STANDARD_DISK = 3;

const WARN_SELECT_NUMBER_PROJECTS = (
  <Text italic>
    Each student will work in their own project. Therefore, make sure to select
    the number of projects (the "Run Limit", above) to match your expected
    number of students!
  </Text>
);

const APPLY_LICENSE_COURSE_CONFIG = (
  <>
    To apply this license to all student projects, add it in the{" "}
    <A
      href={
        "https://doc.cocalc.com/teaching-upgrade-course.html#install-course-license"
      }
    >
      course configuration
    </A>
    .
  </>
);

export const PRESETS: PresetEntries = {
  standard: {
    icon: "line-chart",
    name: "Standard",
    descr: "is a good choice for most users to get started",
    details: (
      <>
        You can run two or three Jupyter Notebooks in the same project at the
        same time, given they do not require a large amount of memory. This
        quota is fine for editing LaTeX documents, working with Sage Worksheets,
        and all other document types as well. {STANDARD_DISK}G of disk space are
        also sufficient to store many files and a few small datasets.
      </>
    ),
    cpu: STANDARD_CPU,
    ram: STANDARD_RAM,
    disk: STANDARD_DISK,
  },
  student: {
    icon: "meh",
    name: "Student",
    descr: "covers student projects in a course",
    details: (
      <>
        If you're teaching a course, this upgrade is suitable for{" "}
        <Text italic>student projects</Text>. The upgrade schema is the same as
        for "Standard" projects, which should be a good choice for doing their
        assignments. {WARN_SELECT_NUMBER_PROJECTS} Each student project will get
        the configured upgrades, internet access, and improved hosting quality.{" "}
        {APPLY_LICENSE_COURSE_CONFIG}
      </>
    ),
    cpu: STANDARD_CPU,
    ram: STANDARD_RAM,
    disk: STANDARD_DISK,
  },
  "student+": {
    icon: "smile",
    name: "Student+",
    descr: "covers student projects with extra resources",
    details: (
      <>
        This quota preset is very similar as the "Student" quota, although
        students will get a bit more ram and disk space.{" "}
        {WARN_SELECT_NUMBER_PROJECTS} The increased idle-timeout will keep their
        notebooks and worksheets a bit longer running, while not in active use.
        Choose this schema, if you plan to let them run data and memory
        intensive calculations, e.g. data-science, machine-learning, etc.{" "}
        {APPLY_LICENSE_COURSE_CONFIG}
      </>
    ),
    cpu: 1,
    ram: 2 * STANDARD_RAM,
    disk: 2 * STANDARD_DISK,
    uptime: "medium",
  },
  instructor: {
    icon: "highlighter",
    name: "Instructor",
    descr:
      "is a good choice for the instructor's project when teaching a course",
    details: (
      <>
        The upgrade schema is suitable for grading the work of students: by
        increasing the memory quota you can run many Jupyter Notebooks at the
        same time – still, make sure to use the{" "}
        <A
          href={
            "https://doc.cocalc.com/jupyter.html?highlight=halt%20button#use-the-halt-button-to-conserve-memory"
          }
        >
          Halt button
        </A>{" "}
        to avoid exceeding the quota. Regarding disk space, distributing and
        collecting files from many students adds up – hence the disk quota is
        increased significantly! Finally, a longer idle-timeout will allow you
        to make longer breaks without your project being shut down. You only
        need a license with a "Run Limit" of one for your instructor project.
        Apply that license via the{" "}
        <A href={"https://doc.cocalc.com/project-settings.html#licenses"}>
          project settings
        </A>
        , not the course configuration!
      </>
    ),
    cpu: 1,
    ram: 6,
    disk: 15,
    uptime: "medium",
  },
  research: {
    icon: "rocket",
    name: "Research",
    descr: "is a good choice for a research group",
    details: (
      <>
        This configuration allows the project to run many Jupyter Notebooks and
        Worksheets at once or run computations that require plenty of memory. An
        idle-timeout of one day is sufficient to not interrupt your work and you
        can also run calculations, which take a while to complete. Increasing
        the disk space quota allows you to store larger datasets as well. If you
        need vastly more disk space, you can also get a{" "}
        <A href={"/store/dedicated?type=disk"}>dedicated disk</A>.
      </>
    ),
    cpu: 1,
    ram: 6,
    disk: 10,
    uptime: "day",
  },
  development: {
    icon: "settings",
    name: "Development",
    descr: "is suitable for software development",
    details: (
      <>
        This configuration helps with parallelizing build tasks across more than
        one CPU, increases the amount of memory and also disk space.
      </>
    ),
    cpu: 2,
    ram: 8,
    disk: 10,
    uptime: "medium",
  },
  /*budget: {
    icon: "wallet",
    name: "Budget",
    descr: "is the cheapest option",
    details: (
      <>
        Choose this option if you want to spend as little money as possible,
        while still getting access to the internet from within a project (to
        download packages, datasets, or interact with GitHub/GitLab). It also
        removes the{" "}
        <A href={"https://doc.cocalc.com/trial.html"}>trial project</A> banner.
      </>
    ),
    cpu: 1,
    ram: 1,
    disk: 3,
    member: false,
  },*/
} as const;
