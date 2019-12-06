/*
The function create_autograde_ipynb takes the instructor and student
stripped ipynb file content (as a string), parses it as JSON and
produces the contents of an autograde.ipynb, which is exactly the notebook
that needs to get run linearly somewhere in order to autograde the
student's work.  Once autograde.ipynb is run straight through, the
relevant output can be extracted from autograde.ipynb and inserted
into student_ipynb to give feedback to the student, provide grades,
etc.

The point of this is to ensure that any weird changes (e.g., to the
kernel, test code, etc.) by the student is *ignored* (not just fixed,
but we never even look at it).  Also, all the extra instructor
tests get run.  We do leave in all other code that the student wrote,
because that may be important for defining variables and functions
that get used in testing.
*/
export function create_autograde_ipynb(
  instructor_ipynb: string,
  student_ipynb: string
): string {
  const instructor = JSON.parse(instructor_ipynb);
  const student = JSON.parse(student_ipynb);
  console.log("create_autograde_ipynb", instructor, student);
  return student_ipynb;
}
