type UUID = string & { _type: "UUID" };
type Path = string & { _type: "Path" };

type DB = "placeholder";
interface Task<T> {
  result: T;
  cancel: () => void;
}

export type create_student = (
  db: DB,
  account: UUID
) => Task<"success" | "error">;

export type create_student_project = (
  db: DB,
  account: UUID
) => Task<"success" | "error">;

// Move assignments to the student's project
export type clone_assignment = (
  project_id: UUID,
  name: string,
  items: Path[]
) => Task<"success" | "error">;
