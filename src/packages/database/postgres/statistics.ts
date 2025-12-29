/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import { days_ago } from "@cocalc/util/misc";
import type { PostgreSQL } from "./types";

export interface GetStatsIntervalOptions {
  start: Date;
  end: Date;
}

export interface StatsEntry {
  id: string;
  time: Date;
  accounts: number;
  projects: number;
  accounts_created?: Record<string, any>;
  accounts_active?: Record<string, any>;
  files_opened?: Record<string, any>;
  projects_created?: Record<string, any>;
  projects_edited?: Record<string, any>;
  hub_servers?: any[];
  running_projects?: Record<string, any>;
}

export interface ActiveStudentStats {
  conversion_rate: number;
  num_student_pay: number;
  num_prof_pay: number;
  num_free: number;
  num_1days: number;
  num_7days: number;
  num_14days: number;
  num_30days: number;
}

interface CourseProjectRow {
  project_id: string;
  course: { pay?: boolean };
  last_edited: Date;
  settings?: { member_host?: boolean };
  users?: Record<string, { upgrades?: { member_host?: boolean } }>;
}

/**
 * Get stats records within a time range, ordered by time.
 *
 * Returns all statistics entries between start and end timestamps.
 */
export async function get_stats_interval(
  db: PostgreSQL,
  opts: GetStatsIntervalOptions,
): Promise<StatsEntry[]> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT * FROM stats",
    where: {
      "time >= $::TIMESTAMP": opts.start,
      "time <= $::TIMESTAMP": opts.end,
    },
    order_by: "time",
  });

  return rows;
}

/**
 * Get active student statistics from course projects in the last 30 days.
 *
 * This analyzes course projects to determine:
 * - Payment models (student pay, professor pay, free)
 * - Activity levels over different time periods
 * - Conversion rate (percentage of paying projects)
 */
export async function get_active_student_stats(
  db: PostgreSQL,
): Promise<ActiveStudentStats> {
  // Query course projects from last 30 days
  const { rows } = await callback2(db._query.bind(db), {
    query:
      "SELECT project_id, course, last_edited, settings, users FROM projects WHERE course IS NOT NULL AND last_edited >= $1",
    params: [days_ago(30)],
  });

  const projects: CourseProjectRow[] = rows;

  // Calculate time thresholds
  const days14 = days_ago(14);
  const days7 = days_ago(7);
  const days1 = days_ago(1);

  // Count student pay projects (student is required to pay)
  const num_student_pay = projects.filter((x) => x.course?.pay === true).length;

  // Count prof pay projects (student isn't required to pay, but
  // project is on members-only host via settings or user upgrades)
  let num_prof_pay = 0;
  for (const x of projects) {
    if (x.course?.pay !== true) {
      // Check project settings for member_host
      if (x.settings?.member_host) {
        num_prof_pay += 1;
        continue;
      }

      // Check if any user has member_host upgrade
      if (x.users) {
        let hasUserUpgrade = false;
        for (const userId in x.users) {
          if (x.users[userId]?.upgrades?.member_host) {
            hasUserUpgrade = true;
            break;
          }
        }
        if (hasUserUpgrade) {
          num_prof_pay += 1;
        }
      }
    }
  }

  // Free projects: neither student pays, and project not on members-only server
  const num_free = projects.length - num_prof_pay - num_student_pay;

  // Calculate conversion rate (percentage of projects that are paying)
  const conversion_rate =
    projects.length > 0
      ? (100 * (num_student_pay + num_prof_pay)) / projects.length
      : 0;

  // Count projects by activity periods
  const num_1days = projects.filter((x) => x.last_edited >= days1).length;
  const num_7days = projects.filter((x) => x.last_edited >= days7).length;
  const num_14days = projects.filter((x) => x.last_edited >= days14).length;
  const num_30days = projects.length;

  return {
    conversion_rate,
    num_student_pay,
    num_prof_pay,
    num_free,
    num_1days,
    num_7days,
    num_14days,
    num_30days,
  };
}
