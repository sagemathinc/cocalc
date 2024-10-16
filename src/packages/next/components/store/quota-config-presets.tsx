/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { IconName } from "@cocalc/frontend/components/icon";
import { Uptime } from "@cocalc/util/consts/site-license";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import { ReactNode } from "react";

export type Preset = "standard" | "instructor" | "research";

// Fields to be used to match a configured license against a pre-existing preset.
//
export const PRESET_MATCH_FIELDS: Record<string, string> = {
  cpu: "CPU count",
  disk: "disk space",
  ram: "memory",
  uptime: "idle timeout",
  member: "member hosting",
};

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
const STANDARD_DISK = 3;

const PRESET_STANDARD_NAME = "Standard";

export const PRESETS: PresetEntries = {
  standard: {
    icon: "line-chart",
    name: PRESET_STANDARD_NAME,
    descr:
      "is a good choice for most users to get started and students in a course",
    expect: [
      "Run 2 or 3 Jupyter Notebooks at the same time,",
      "Edit LaTeX, Markdown, and R Documents,",
      `${STANDARD_DISK} GB disk space is sufficient to store many files and small datasets.`,
    ],
    note: (
      <Paragraph type="secondary">
        You can start small with just a "Run Limit" of one and small quotas.
        Later, if your usage incrases, you can edit your license to change the
        "Run Limit" and/or the quotas. Read more about{" "}
        <A href={"https://doc.cocalc.com/licenses.html"}>Managing Licenses</A>{" "}
        in our documentation.
      </Paragraph>
    ),
    details: (
      <>
        You can run two or three Jupyter Notebooks in the same project at the
        same time, given they do not require a large amount of memory. This
        quota is fine for editing LaTeX documents, working with Sage Worksheets,
        and all other document types. Also, {STANDARD_DISK} GB of disk space is
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
    descr: "for your instructor project when teaching a course",
    expect: [
      "Grade the work of students,",
      "Run several Jupyter Notebooks at the same time¹,",
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
          ¹ Still, make sure to use the{" "}
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
    disk: 15,
    uptime: "medium",
    member: true,
  },
  research: {
    icon: "users",
    name: "Researcher",
    descr: "is a good choice for intesse usage or a research group",
    expect: [
      "Run many Jupyter Notebooks at once,",
      "Run memory-intensive computations,",
      "1 day idle-timeout is sufficient to not interrupt your work,",
      "and to execute long-running calculations.",
      "More disk space also allows you to store larger datasets.",
    ],
    note: (
      <>
        <Paragraph type="secondary">
          If you need <b>vastly more dedicated disk space, CPU or RAM</b>, you
          should instead{" "}
          <b>
            rent a{" "}
            <A href="https://doc.cocalc.com/compute_server.html">
              compute server
            </A>
            .
          </b>
        </Paragraph>
      </>
    ),
    details: (
      <>
        This configuration allows the project to run many Jupyter Notebooks and
        Worksheets at once or to run memory-intensive computations. An
        idle-timeout of one day is sufficient to not interrupt your work; you
        can also execute long-running calculations with this configuration.
        Increasing the disk space quota also allows you to store larger
        datasets. If you need{" "}
        <b>vastly more dedicated disk space, CPU or RAM</b>, you should instead{" "}
        <b>
          rent a{" "}
          <A href="https://doc.cocalc.com/compute_server.html">
            compute server
          </A>
          .
        </b>
      </>
    ),
    cpu: 2,
    ram: 10,
    disk: 10,
    uptime: "day",
    member: true,
  },
} as const;
