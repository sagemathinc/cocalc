/*
Convert R Markdown file to hidden Markdown file, then read.
*/

// import { aux_file } from "../frame-tree/util";
import { path_split, change_filename_extension } from "../generic/misc";
import { exec, read_text_file_from_project } from "../generic/client";

export async function convert(
  project_id: string,
  path: string,
  time?: number
): Promise<string> {
  const x = path_split(path);
  let infile = x.tail;
  //let outfile = aux_file(x.tail, "html");

  const args = [
    "-e",
    // `library(knitr);knit('${infile}','${outfile}',quiet=TRUE)`
    `require(rmarkdown); rmarkdown::render('${infile}', output_format=c('pdf_document', 'html_document', 'md_document'), runtime=c('static'), run_pandoc=TRUE)`
  ];

  await exec({
    allow_post: false, // definitely could take a long time to fully run all the R stuff...
    timeout: 90,
    bash: true, // so timeout is enforced by ulimit
    command: "Rscript",
    args,
    project_id: project_id,
    path: x.head,
    err_on_exit: true,
    aggregate: time
  });

  //if (output.status && output.status == 'error') {
  //  throw new Error(output.error);
  //}

  // magling formuas is a known issue, e.g. I found
  // https://stackoverflow.com/questions/39183406/do-not-escape-backslashes-in-formulas-with-rmarkdown-md-document
  return await read_text_file_from_project({
    project_id: project_id,
    path: change_filename_extension(path, "html") // aux_file(path, "md")
  });
}
