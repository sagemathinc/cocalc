/*
Convert R Markdown file to hidden Markdown file, then read.
*/

// import { aux_file } from "../frame-tree/util";
import { path_split /* change_filename_extension */ } from "../generic/misc";
import {
  exec,
  ExecOutput /* read_text_file_from_project */
} from "../generic/client";

export async function convert(
  project_id: string,
  path: string,
  frontmatter: string,
  time?: number
): Promise<ExecOutput> {
  const x = path_split(path);
  let infile = x.tail;
  //let outfile = aux_file(x.tail, "html");

  // console.log("frontmatter", frontmatter);
  let cmd: string;
  // add 'pdf_document' to also produce a pdf out of a .tex file, but this is too flaky -- disabled
  // https://www.rdocumentation.org/packages/rmarkdown/versions/1.10/topics/render
  // unless user specifies some self_contained value, we disable it as a convenience (rough heuristic, but should be fine)
  if (frontmatter.indexOf("self_contained") >= 0) {
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE)`;
  } else {
    cmd = `rmarkdown::render('${infile}', output_format = NULL, output_options = list(self_contained = FALSE) , run_pandoc = TRUE)`;
  }

  return await exec({
    allow_post: false, // definitely could take a long time to fully run all the R stuff...
    timeout: 90,
    bash: true, // so timeout is enforced by ulimit
    command: "Rscript",
    args: ["-e", cmd],
    project_id: project_id,
    path: x.head,
    err_on_exit: true,
    aggregate: time
  });

  //if (output.status && output.status == 'error') {
  //  throw new Error(output.error);
  //}

  // mangling formuas is a known issue, e.g. I found
  // https://stackoverflow.com/questions/39183406/do-not-escape-backslashes-in-formulas-with-rmarkdown-md-document
  // return await read_text_file_from_project({
  //   project_id: project_id,
  //   path: change_filename_extension(path, "md") // aux_file(path, "md")
  // });
}
