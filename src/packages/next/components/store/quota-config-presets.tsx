import { IconName } from "@cocalc/frontend/components/icon";
import { Uptime } from "@cocalc/util/consts/site-license";
import { ReactNode } from "react";

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

export const PRESETS: PresetEntries = {
  standard: {
    name: "Standard",
    descr: "Standard Quota",
    cpu: 1,
    ram: 2,
    disk: 3,
  },
  student: {
    name: "Student",
    descr: "Students in a course",
    details: (
      <>
        This upgrade is for <em>your students</em> in the course.
      </>
    ),
    cpu: 1,
    ram: 2,
    disk: 3,
  },
  "student+": {
    name: "Student+",
    descr: "Students in a course with extra resources",
    cpu: 1,
    ram: 3,
    disk: 6,
    uptime: "medium",
  },
  instructor: {
    name: "Instructor",
    descr: "Instructor project of a course",
    cpu: 1,
    ram: 6,
    disk: 16,
    uptime: "medium",
  },
  research: {
    name: "Research",
    descr: "Research project",
    cpu: 2,
    ram: 6,
    disk: 10,
    uptime: "medium",
  },
  development: {
    name: "Development",
    descr: "Development project",
    cpu: 2,
    ram: 10,
    disk: 10,
    uptime: "medium",
  },
  budget: {
    icon: "wallet",
    name: "Budget",
    descr: "is the cheapest option",
    details: "Choose this option if you want to spend as little money as possible, while still having acccess to the internet and not being nagged about using a trial project.",
    cpu: 1,
    ram: 1,
    disk: 3,
    member: false,
  },
} as const;
