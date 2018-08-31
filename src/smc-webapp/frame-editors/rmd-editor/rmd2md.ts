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
    // add 'pdf_document' to also produce a pdf out of a .tex file, but this is too flaky -- disabled
    // TODO maybe we add a "PDF" button to the UI, which runs this explicitly
    // output_format=c('md_document', 'html_document') ... but we allow the first one specified or html by default
    // https://www.rdocumentation.org/packages/rmarkdown/versions/1.10/topics/render
    `rmarkdown::render('${infile}', output_format=NULL, run_pandoc=TRUE)`
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
