export interface NBGraderAPIOptions {
  // Project will try to evaluate/autograde for this many milliseconds;
  // if time is exceeded, all additional problems fail and what we graded
  // so far is returned.
  timeout_ms: number;
  cell_timeout_ms: number;
  max_output?: number;
  max_output_per_cell?: number;

  // The *contents* of the student-submitted ipynb file, but with
  // all output deleted (to keep it small).  This is NOT a filename
  // but actual ipynb contents!
  student_ipynb: string;

  // The contents of the instructor version of the ipynb file, but
  // also with any output deleted.   This contains a record of *what*
  // questions were asked and also additional more extensive checks of
  // student solutions.  Again, this is NOT a file name, but ipynb contents!
  instructor_ipynb: string;

  // Directory in which to run grading (e.g., so accessing
  // a data file or auxiliary scripts might work).
  path: string;

  // Project in which to run grading.
  project_id: string;
}

export interface NBGraderAPIResponse {
  output: any; // TODO
  // ids = the ordered id's of the cells that can have grades assigned to them;
  // order is the order in which they occur in the notebook. These include autograded
  // cells, but also manually graded cells.  This info is extracted from the instructor
  // notebook, not the student notebook.
  ids: string[];
}

export interface RunNotebookLimits {
  max_output?: number; // any output that pushes the total length beyond this many characters is ignored.
  max_output_per_cell?: number; // any output that pushes a single cell's output beyond this many characters is ignored.
  max_time_per_cell_ms?: number; // if running a cell takes longer than this, we interrupt/kill it.
  max_total_time_ms?: number; // if total time to run all cells exceeds this time, we interrupt/kill.
}

export interface RunNotebookOptions {
  // where to run it
  path: string;
  // contents of the ipynb file (NOT THE PATH)
  ipynb: string;
  nbgrader?: boolean; // if true, only record outputs for nbgrader autograder cells (all cells are run, but only these get output)
  limits?: RunNotebookLimits;
}

// Enough description of what a Jupyter notebook is for our purposes here.
export interface Cell {
  cell_type: "code" | "markdown" | "raw";
  execution_count: number;
  metadata?: {
    collapsed?: boolean;
    nbgrader?: {
      grade: boolean;
      grade_id: string;
      locked: boolean;
      points?: number;
      schema_version: number;
      solution: boolean;
      task: boolean;
    };
  };
  source: string[];
  outputs?: object[];
}

export interface NotebookMetadata {
  kernelspec: {
    display_name: string;
    language: string;
    metadata?: object;
    name: string;
  };
  language_info: {
    codemirror_mode?: { name: string; version: number };
    file_extension: string;
    mimetype: string;
    name: string;
    nbconvert_exporter: string;
    pygments_lexer: string;
    version: string;
  };
}

export interface JupyterNotebook {
  metadata: NotebookMetadata;
  nbformat: number;
  nbformat_minor: number;
  cells: Cell[];
}
