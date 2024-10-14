/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { IconName } from "@cocalc/frontend/components/icon";
import { Uptime } from "@cocalc/util/consts/site-license";
import A from "components/misc/A";
import { ReactNode } from "react";

export type Presets = "standard" | "instructor" | "research";

// Fields to be used to match a configured license against a pre-existing preset.
//
export const PRESET_MATCH_FIELDS: Record<string, string> = {
  cpu: "CPU count",
  disk: "disk space",
  ram: "memory",
  uptime: "idle timeout",
  member: "member hosting",
};

export interface Preset {
  icon?: IconName;
  name: string;
  descr: ReactNode;
  details?: ReactNode;
  cpu: number;
  ram: number;
  disk: number;
  uptime: Uptime;
  member: boolean;
}

type PresetEntries = {
  [key in Presets]: Preset;
};

// some constants to keep text and preset in sync
const STANDARD_CPU = 1;
const STANDARD_RAM = 4;
const STANDARD_DISK = 3;

export const PRESETS: PresetEntries = {
  standard: {
    icon: "line-chart",
    name: "Standard",
    descr: "is a good choice for most users and students to get started",
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
    ram: 2 * STANDARD_RAM,
    disk: 15,
    uptime: "medium",
    member: true,
  },
  research: {
    icon: "users",
    name: "Researcher",
    descr: "is a good choice for a research group",
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
