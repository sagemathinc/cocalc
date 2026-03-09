# Course Management

This document explains CoCalc's course management system — how instructors
create courses, manage students, distribute assignments, collect work, and
handle grading.

## Overview

A CoCalc course is a `.course` file — a **SyncDB** document that stores all
course data (students, assignments, handouts, settings) as records with
real-time collaboration. The course system:

- Creates and configures **student projects** automatically
- **Distributes** assignment files from instructor → student projects
- **Collects** submissions from student → instructor project
- Supports **peer grading** workflows
- Integrates **nbgrader** for automated Jupyter notebook grading
- Manages **site licenses** and student payment

```
┌──────────────────────┐
│  Course Project       │   ← Instructor's project
│  (.course SyncDB)     │
│                       │
│  assignments/         │   ← Master copies
│  handouts/            │
└──────────┬────────────┘
           │ copy_path_between_projects()
    ┌──────┼──────┬──────────┐
    │      │      │          │
    ▼      ▼      ▼          ▼
┌──────┐┌──────┐┌──────┐┌──────┐
│Stu A ││Stu B ││Stu C ││Shared│  ← Student projects
│Proj  ││Proj  ││Proj  ││Proj  │
└──────┘└──────┘└──────┘└──────┘
```

## .course File Format (SyncDB)

The `.course` file uses SyncDB with:

```typescript
primary_keys: ["table", "handout_id", "student_id", "assignment_id"];
```

Records are organized into four logical **tables** via the `table` field.

### Settings Table

One record with `table: "settings"`:

| Field                           | Type                     | Description                                |
| ------------------------------- | ------------------------ | ------------------------------------------ |
| `title`                         | `string`                 | Course title                               |
| `description`                   | `string`                 | Course description                         |
| `allow_collabs`                 | `boolean`                | Whether students can add collaborators     |
| `shared_project_id`             | `string`                 | Shared project visible to all students     |
| `student_pay`                   | `boolean`                | Whether students must pay                  |
| `pay`                           | `string \| Date`         | Payment deadline (ISO timestamp)           |
| `payInfo`                       | `PurchaseInfo`           | License details for student payment        |
| `site_license_id`               | `string`                 | Comma-separated license IDs                |
| `site_license_strategy`         | `"serial" \| "parallel"` | License application mode                   |
| `copy_parallel`                 | `number`                 | Parallelism for file copies                |
| `nbgrader_grade_project`        | `string`                 | Dedicated grading project ID               |
| `nbgrader_cell_timeout_ms`      | `number`                 | Per-cell timeout (default: 60s)            |
| `nbgrader_timeout_ms`           | `number`                 | Total timeout (default: 10min)             |
| `nbgrader_parallel`             | `number`                 | Parallel grading processes                 |
| `student_project_functionality` | `object`                 | Feature restrictions for students          |
| `datastore`                     | `Datastore`              | Datastore config for student projects      |
| `envvars`                       | `EnvVars`                | Environment variables for student projects |

### Students Table

One record per student with `table: "students"`:

| Field               | Type      | Description                                |
| ------------------- | --------- | ------------------------------------------ |
| `student_id`        | `string`  | UUID                                       |
| `account_id`        | `string`  | CoCalc account ID (if registered)          |
| `email_address`     | `string`  | Email (for inviting unregistered students) |
| `first_name`        | `string`  | Student's first name                       |
| `last_name`         | `string`  | Student's last name                        |
| `project_id`        | `string`  | ID of student's course project             |
| `deleted`           | `boolean` | Soft-deleted                               |
| `email_invite`      | `string`  | Email invite template                      |
| `last_email_invite` | `number`  | Timestamp of last email invite             |
| `create_project`    | `number`  | When project creation started              |

### Assignments Table

One record per assignment with `table: "assignments"`:

| Field                | Type                           | Description                                    |
| -------------------- | ------------------------------ | ---------------------------------------------- |
| `assignment_id`      | `string`                       | UUID                                           |
| `path`               | `string`                       | Path in course project                         |
| `target_path`        | `string`                       | Destination in student project                 |
| `collect_path`       | `string`                       | Where collected work goes in course project    |
| `graded_path`        | `string`                       | Where graded work goes back in student project |
| `deleted`            | `boolean`                      | Soft-deleted                                   |
| `nbgrader`           | `boolean`                      | Has nbgrader metadata                          |
| `has_student_subdir` | `boolean`                      | Uses student subdirectory pattern              |
| `grades`             | `{[student_id]: string}`       | Manual grades                                  |
| `comments`           | `{[student_id]: string}`       | Instructor feedback                            |
| `nbgrader_scores`    | `{[student_id]: ...}`          | Automated scores per notebook                  |
| `peer_grade`         | `PeerGradeConfig`              | Peer grading configuration                     |
| `last_assignment`    | `{[student_id]: LastCopyInfo}` | Distribution status                            |
| `last_collect`       | `{[student_id]: LastCopyInfo}` | Collection status                              |
| `last_return_graded` | `{[student_id]: LastCopyInfo}` | Return status                                  |

### Handouts Table

One record per handout with `table: "handouts"`:

| Field         | Type                           | Description                    |
| ------------- | ------------------------------ | ------------------------------ |
| `handout_id`  | `string`                       | UUID                           |
| `path`        | `string`                       | Path in course project         |
| `target_path` | `string`                       | Destination in student project |
| `deleted`     | `boolean`                      | Soft-deleted                   |
| `status`      | `{[student_id]: LastCopyInfo}` | Distribution status            |

### LastCopyInfo

Tracks the status of file copy operations:

```typescript
interface LastCopyInfo {
  time?: number; // timestamp of successful copy (ms)
  error?: string; // error message if failed
  start?: number; // timestamp when copy started
}
```

## Assignment Workflow

### Steps

```typescript
// Without peer grading:
["assignment", "collect", "return_graded"][
  // With peer grading:
  ("assignment", "collect", "peer_assignment", "peer_collect", "return_graded")
];
```

### 1. Distribute Assignment

`AssignmentsActions.copy_assignment_to_student(assignment_id, student_id)`:

1. Create student project if it doesn't exist
2. Copy files: `course_project:assignment.path` →
   `student_project:assignment.target_path`
3. Update `last_assignment[student_id]` with timestamp

### 2. Collect Submissions

`AssignmentsActions.copy_assignment_from_student(assignment_id, student_id)`:

1. Copy files: `student_project:target_path` →
   `course_project:collect_path/{student_id}`
2. Create `STUDENT - {name}.txt` reference file
3. Update `last_collect[student_id]`

### 3. Grade (Manual or nbgrader)

- **Manual**: instructor sets `grades[student_id]` and `comments[student_id]`
- **nbgrader**: automated grading stores scores in `nbgrader_scores`

### 4. Return Graded Work

`AssignmentsActions.return_assignment_to_student(assignment_id, student_id)`:

1. Generate grade file with grade and comments
2. Copy graded work to `student_project:graded_path`
3. Update `last_return_graded[student_id]`

## Peer Grading

### Configuration

```typescript
peer_grade: {
  enabled: boolean;
  due_date: number;      // timestamp
  guidelines?: string;   // markdown instructions
  map: {                 // auto-generated mapping
    [grader_student_id: string]: string[]  // → students they grade
  };
}
```

### Algorithm

`packages/util/misc.ts` — `peer_grading(students, N)`:

- Circular assignment: student `i` grades students `i+1` through `i+N`
- Default `N = 2` (each student grades 2 peers)
- No student grades themselves

### Workflow

1. **Assign to peers**: copy collected work to peer grader projects
2. Graders write feedback in `GRADING-GUIDE.md` with markers:
   - `OVERALL GRADE (a single number):`
   - `COMMENTS ABOUT GRADE:`
3. **Collect from peers**: gather graded work back
4. **Return to student**: include peer feedback

## Student Project Management

### Project Creation

`StudentProjectsActions.create_student_project(student_id)`:

1. Create project via `redux.getActions("projects").create_project()`
2. Configure project with course settings
3. Store `project_id` in student record

### Project Configuration

`StudentProjectsActions.configure_project()` applies:

- Title and description from course settings
- Course info (`CourseInfo`) to `projects.course` field
- Site licenses
- Environment variables
- Student project functionality restrictions
- Upgrade goals

### CourseInfo (in projects table)

```typescript
// packages/util/db-schema/projects.ts
interface CourseInfo {
  type: "student" | "shared" | "nbgrader";
  account_id?: string; // student's account
  project_id: string; // course project ID
  path: string; // path to .course file
  pay?: string; // payment deadline
  paid?: string; // when they paid
  payInfo?: PurchaseInfo;
  datastore?: Datastore;
  student_project_functionality?: StudentProjectFunctionality;
  envvars?: EnvVars;
}
```

### Project Types

| Type             | Description                                           |
| ---------------- | ----------------------------------------------------- |
| Course project   | Instructor's project containing the `.course` file    |
| Student project  | One per student, `course.type = "student"`            |
| Shared project   | Visible to all students, `course.type = "shared"`     |
| NBGrader project | Dedicated grading sandbox, `course.type = "nbgrader"` |

## Redux Architecture

### Store

`packages/frontend/course/store.ts` — `CourseStore`:

Key methods:

- `get_students()` / `get_student(id)` — student records
- `get_assignments()` / `get_assignment(id)` — assignment records
- `get_handouts()` / `get_handout(id)` — handout records
- `get_assignment_status(id)` — counts of distributed/collected/graded
- `get_grade(assignment_id, student_id)` — get grade
- `get_student_project_ids()` — all student project IDs

### Actions

`packages/frontend/course/actions.ts` — `CourseActions` composes sub-action
classes:

| Sub-Actions Class        | File                          | Purpose                    |
| ------------------------ | ----------------------------- | -------------------------- |
| `StudentsActions`        | `students/actions.ts`         | Add/remove students        |
| `AssignmentsActions`     | `assignments/actions.ts`      | Assignment lifecycle       |
| `HandoutsActions`        | `handouts/actions.ts`         | Handout distribution       |
| `ConfigurationActions`   | `configuration/actions.ts`    | Course settings            |
| `StudentProjectsActions` | `student-projects/actions.ts` | Project creation           |
| `SharedProjectActions`   | `shared-project/actions.ts`   | Shared project             |
| `ComputeActions`         | `compute/actions.ts`          | Compute server integration |
| `ActivityActions`        | `activity/actions.ts`         | UI activity tracking       |
| `ExportActions`          | `export/actions.ts`           | Grade export               |

### SyncDB Initialization

`packages/frontend/course/sync.ts` — `create_sync_db()`:

```typescript
// Creates SyncDB connection to the .course file
const syncdb = webapp_client.sync_client.sync_db({
  project_id,
  path,
  primary_keys: ["table", "handout_id", "student_id", "assignment_id"],
});
```

## Configuration Options

### Student Project Functionality

Instructors can restrict what students can do:

```typescript
interface StudentProjectFunctionality {
  disableTerminals?: boolean;
  disableUploads?: boolean;
  disableNetwork?: boolean;
  disableSSH?: boolean;
  disableCollaborators?: boolean;
  // ...
}
```

### Site Licenses

- **Serial**: one license per student project (sequential allocation)
- **Parallel**: students share licenses concurrently
- Added/removed via `add_site_license_id()` / `remove_site_license_id()`

### Student Payment

```typescript
interface PurchaseInfo {
  type: "license";
  quantity: number;
  start: Date;
  end: Date;
  version: string;
  cost?: number; // locked in by system
}
```

Flow: instructor sets `student_pay: true` + `payInfo` → `pay` deadline →
student sees payment prompt → `paid` timestamp recorded.

## Key Constants

| Constant                   | Value       | Description                |
| -------------------------- | ----------- | -------------------------- |
| `PARALLEL_DEFAULT`         | 5           | Default copy parallelism   |
| `MAX_COPY_PARALLEL`        | 25          | Maximum copy parallelism   |
| `COPY_TIMEOUT_MS`          | 300000      | File copy timeout (5 min)  |
| `NBGRADER_CELL_TIMEOUT_MS` | 60000       | nbgrader per-cell timeout  |
| `NBGRADER_TIMEOUT_MS`      | 600000      | nbgrader total timeout     |
| `NBGRADER_MAX_OUTPUT`      | 4000000     | Max total nbgrader output  |
| `STUDENT_SUBDIR`           | `"student"` | Student files subdirectory |

## Key Source Files

| File                                                       | Description                         |
| ---------------------------------------------------------- | ----------------------------------- |
| `packages/frontend/course/store.ts`                        | CourseStore — state and getters     |
| `packages/frontend/course/actions.ts`                      | CourseActions — orchestrator        |
| `packages/frontend/course/types.ts`                        | TypeScript types for SyncDB records |
| `packages/frontend/course/redux.ts`                        | Redux init/cleanup                  |
| `packages/frontend/course/sync.ts`                         | SyncDB creation                     |
| `packages/frontend/course/students/actions.ts`             | Student management                  |
| `packages/frontend/course/assignments/actions.ts`          | Assignment lifecycle                |
| `packages/frontend/course/handouts/actions.ts`             | Handout distribution                |
| `packages/frontend/course/configuration/actions.ts`        | Course settings                     |
| `packages/frontend/course/student-projects/actions.ts`     | Project creation                    |
| `packages/frontend/course/shared-project/actions.ts`       | Shared project                      |
| `packages/frontend/course/export/actions.ts`               | Grade export                        |
| `packages/frontend/course/nbgrader/scores.tsx`             | NBGrader score display              |
| `packages/frontend/frame-editors/course-editor/actions.ts` | Frame editor integration            |
| `packages/server/projects/course/set-course-info.ts`       | Backend: set CourseInfo             |
| `packages/util/db-schema/projects.ts`                      | CourseInfo interface                |

## Common Patterns for Agents

### Reading Course Data

```typescript
const store = redux.getStore(course_name) as CourseStore;
const students = store.get_students();
const assignments = store.get_assignments();
const status = store.get_assignment_status(assignment_id);
```

### Modifying Course Data

```typescript
// All modifications go through the SyncDB
const syncdb = store.get_syncdb();
syncdb.set({
  table: "settings",
  title: "New Title",
});
syncdb.commit();

// Or through actions
const actions = redux.getActions(course_name) as CourseActions;
actions.students.add_students([{ email_address: "student@example.com" }]);
actions.assignments.addAssignment("homework/hw1");
```

### Assignment Status Check

```typescript
const status = store.get_assignment_status(assignment_id);
// { assignment: 25, not_assignment: 5, collect: 20, not_collect: 10, ... }
```
