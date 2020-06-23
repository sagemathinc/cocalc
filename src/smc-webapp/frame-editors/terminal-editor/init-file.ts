/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const { console_init_filename } = require("smc-util/misc");
import { exec } from "../generic/client";

function init_file_content(path: string): string {
  return `# This initialization file is associated with your terminal in ${path}.
# It is automatically run whenever it starts up -- restart the terminal via Ctrl-d and Return-key.

# Usually, your ~/.bashrc is executed and this behavior is emulated for completeness:
source ~/.bashrc

# You can export environment variables, e.g. to set custom GIT_* variables
# https://git-scm.com/book/en/v2/Git-Internals-Environment-Variables
#export GIT_AUTHOR_NAME="Your Name"
#export GIT_AUTHOR_EMAIL="your@email.address"
#export GIT_COMMITTER_NAME="Your Name"
#export GIT_COMMITTER_EMAIL="your@email.address"

# It is also possible to automatically start a program ...

#sage
#sage -ipython
#top

# ... or even define a terminal specific function.
#hello () { echo "hello world"; }\
`;
}

// TODO: this will break if the filename  is ugly, e.g.,
// with backslashes or apostrophes, etc.  I'm just copying
// over what we had before...
async function create_init_file(
  project_id: string,
  init_filename: string
): Promise<void> {
  const content = init_file_content(init_filename);
  const command = `test ! -r '${init_filename}' && echo '${content}' > '${init_filename}'`;
  await exec({
    project_id: project_id,
    command,
    bash: true,
    err_on_exit: false,
  });
}

export async function open_init_file(
  project_actions,
  path: string
): Promise<void> {
  const init_filename: string = console_init_filename(path);
  await create_init_file(project_actions.project_id, init_filename);
  project_actions.open_file({ path: init_filename, foreground: true });
}
