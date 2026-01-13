/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ReactNode } from "react";
import type { IconName } from "@cocalc/frontend/components/icon";
import { Uptime } from "@cocalc/util/consts/site-license";
import { MAX_DISK_GB } from "@cocalc/util/upgrades/consts";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import { STANDARD_DISK } from "@cocalc/util/consts/billing";

export type Preset = "standard" | "instructor" | "research";

// Fields to be used to match a configured license against a pre-existing preset.
//
export const PRESET_MATCH_FIELDS: Record<string, string> = {
  cpu: "CPU count",
  disk: "disk space",
  ram: "memory",
  uptime: "idle timeout",
  member: "member hosting",
} as const;

export interface PresetConfig {
  icon: IconName;
  name: string;
  descr: ReactNode;
  details: ReactNode;
  cpu: number;
  ram: number;
  disk: number;
  uptime: Uptime;
  member: boolean;
  expect: string[];
  note?: ReactNode;
}

type PresetEntries = {
  [key in Preset]: PresetConfig;
};

// some constants to keep text and preset in sync
const STANDARD_CPU = 1;
const STANDARD_RAM = 4;

const PRESET_STANDARD_NAME = "Standard";

export const SITE_LICENSE: PresetEntries = {
  standard: {
    icon: "line-chart",
    name: PRESET_STANDARD_NAME,
    descr:
      "is a good choice for most users to get started and students in a course",
    expect: [
      "Run 5-10 Jupyter Notebooks at once,",
      "Edit LaTeX, Markdown, R Documents, and use VS Code,",
      `${STANDARD_DISK} GB disk space is sufficient to store many files and small datasets.`,
    ],
    note: (
      <Paragraph type="secondary">
        You can start with a "Run Limit" of one project. Later, when your usage
        increases, you can easily edit your license at any time to change the
        "Run Limit" or the quotas. Read more about{" "}
        <A href={"https://doc.cocalc.com/licenses.html"}>Managing Licenses</A>{" "}
        in our documentation.
      </Paragraph>
    ),
    details: (
      <>
        You can run 5-10 Jupyter Notebooks in a project at once, depending on
        the kernel and memory usage. This quota is fine for editing LaTeX
        documents, working with Sage Worksheets, using VS Code, and editing all
        other document types. Also, {STANDARD_DISK} GB of disk space is
        sufficient to store many files and a few small datasets.
      </>
    ),
    cpu: STANDARD_CPU,
    ram: STANDARD_RAM,
    disk: STANDARD_DISK,
    uptime: "short",
    member: true,
  },
  instructor: {
    icon: "slides",
    name: "Instructor",
    descr: "is good for your instructor project when teaching a course",
    expect: [
      "Grade the work of students,",
      "Run 10-20 Jupyter Notebooks at once¹,",
      "Store the files of all students,",
      "Make longer breaks without your project being shut down.",
    ],
    note: (
      <>
        <Paragraph type="secondary">
          For your instructor project, you only need one such license with a
          "Run Limit" of 1. Apply that license via the{" "}
          <A href={"https://doc.cocalc.com/project-settings.html#licenses"}>
            project settings
          </A>
          . For the students, select a "{PRESET_STANDARD_NAME}" license with a
          "Run Limit" of the number of students and distribute it via the{" "}
          <A
            href={
              "https://doc.cocalc.com/teaching-upgrade-course.html#teacher-or-institute-pays-for-upgrades"
            }
          >
            course configuration
          </A>
          .
        </Paragraph>
        <Paragraph type="secondary">
          ¹ Depends on the kernel; also, make sure to use the{" "}
          <A
            href={
              "https://doc.cocalc.com/jupyter.html?highlight=halt%20button#use-the-halt-button-to-conserve-memory"
            }
          >
            Halt button
          </A>
          .
        </Paragraph>
      </>
    ),
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
    ram: 2 * STANDARD_RAM,
    disk: Math.min(Math.max(15, 4 * STANDARD_DISK), MAX_DISK_GB),
    uptime: "medium",
    member: true,
  },
  research: {
    icon: "users",
    name: "Researcher",
    descr:
      "is a good choice for intense professional usage or a research group",
    expect: [
      "Run many Jupyter Notebooks at once,",
      "Run memory-intensive computations,",
      "1 day idle-timeout is sufficient to not interrupt your work, and to execute long-running calculations.",
      "More disk space also allows you to store larger datasets.",
    ],
    note: (
      <>
        <Paragraph type="secondary">
          If you need <b>much more storage, a GPU, more CPU or RAM</b>, you
          should also{" "}
          <b>
            use <A href="/features/compute-server">compute servers</A>.
          </b>
        </Paragraph>
      </>
    ),
    details: (
      <>
        This configuration allows the project to run many Jupyter Notebooks at
        once and run memory-intensive computations. An idle-timeout of one day
        is sufficient to not interrupt your work; you can also execute
        long-running calculations with this configuration. Increasing the disk
        space quota also allows you to store larger datasets. If you need{" "}
        <b>much more storage, a GPU, more CPU or RAM</b>, you should also{" "}
        <b>
          use a <A href="/features/compute-server">compute server</A>.
        </b>
      </>
    ),
    cpu: 2,
    ram: 2 * STANDARD_RAM,
    disk: Math.min(Math.max(15, 4 * STANDARD_DISK), MAX_DISK_GB),
    uptime: "day",
    member: true,
  },
} as const;

export const COURSE = {
  standard: {
    icon: "line-chart",
    name: PRESET_STANDARD_NAME,
    descr: "is a good choice for most use cases in a course",
    expect: [
      "Run a couple of Jupyter Notebooks at once,",
      "Edit LaTeX, Markdown, R Documents, and use VS Code,",
      `${STANDARD_DISK} GB disk space is sufficient to store many files and small datasets.`,
    ],
    note: <>Suitable for most courses.</>,
    details: (
      <>
        You can run a couple of Jupyter Notebooks in a project at once,
        depending on the kernel and memory usage. This quota is fine for editing
        LaTeX documents, working with Sage Worksheets, using VS Code, and
        editing all other document types. Also, {STANDARD_DISK} GB of disk space
        is sufficient to store many files and a few small datasets.
      </>
    ),
    cpu: STANDARD_CPU,
    ram: STANDARD_RAM,
    disk: STANDARD_DISK,
    uptime: "short",
    member: true,
  },
  advanced: {
    icon: "rocket",
    name: "Advanced",
    descr: "provides higher quotas for more intensive course work",
    expect: [
      "Run more Jupyter Notebooks simultaneously,",
      "Handle memory-intensive computations,",
      "Longer idle timeout for extended work sessions,",
      "Sufficient resources for advanced coursework.",
    ],
    note: <>For intense computations requiring more resources.</>,
    details: (
      <>
        This configuration provides enhanced resources for more demanding
        coursework. With 1 CPU, 8GB RAM, and a 2-hour idle timeout, students can
        work on memory-intensive projects and longer computational tasks without
        interruption. Ideal for advanced programming, data science, and
        research-oriented courses.
      </>
    ),
    cpu: 1,
    ram: 8,
    disk: Math.min(2 * STANDARD_DISK, MAX_DISK_GB),
    uptime: "medium",
    member: true,
  },
} as const satisfies { [key in "standard" | "advanced"]: PresetConfig };
