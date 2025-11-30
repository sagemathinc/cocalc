/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { constants as fs_constants } from "fs";
import { access, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { executeCode } from "@cocalc/backend/execute-code";

const EXCLUDES_FN = join(homedir(), ".gitexcludes");

const EXCLUDES = `\
# Global .gitignore file
# You can edit this file, CoCalc will not change it.
# configured via ~/.gitconfig: core/excludesfile

### CoCalc Platform ###
/.snapshots/
.*.chat
.*.sage-chat
.*.sage-history
.*.sage-jupyter
.*.sage-jupyter2
.*.syncdb
.*.syncdoc
.*.syncdoc[34]

### Linux hidden files ###
/.*
*~

### Python ###
__pycache__/
*.py[cod]

# SageMath parsed files
*.sage.py

# mypy typechecker
.mypy_cache/

### JupyterNotebooks ###
.ipynb_checkpoints/

### LaTeX ###
# Core latex/pdflatex auxiliary files:
*.aux
*.lof
*.log
*.lot
*.fls
*.out
*.toc
*.fmt
*.fot
*.cb
*.cb2
.*.lb

# Bibliography auxiliary files (bibtex/biblatex/biber):
*.bbl
*.bcf
*.blg
*-blx.aux
*-blx.bib
*.run.xml

# Build tool auxiliary files:
*.fdb_latexmk
*.synctex
*.synctex(busy)
*.synctex.gz
*.synctex.gz(busy)
*.pdfsync

# knitr
*-concordance.tex

# sagetex
*.sagetex.sage
*.sagetex.py
*.sagetex.scmd

# pythontex
*.pytxcode
pythontex-files-*/
`;

// initialize files in a project to help working with git
export async function init_gitconfig(winston: {
  debug: Function;
}): Promise<void> {
  const conf = await executeCode({
    command: "git",
    args: ["config", "--global", "--get", "core.excludesfile"],
    bash: false,
    err_on_exit: false,
  });
  // exit_code == 1 if key isn't set. only then we check if there is no file and do the setup
  if (conf.exit_code != 0) {
    winston.debug("git: core.excludesfile key not set");
    try {
      // throws if files doesn't exist
      await access(EXCLUDES_FN, fs_constants.F_OK);
      winston.debug(`git: excludes file '${EXCLUDES_FN}' exists -> abort`);
      return;
    } catch {}
    winston.debug(
      `git: writing '${EXCLUDES_FN}' file and setting global git config`
    );
    await writeFile(EXCLUDES_FN, EXCLUDES, "utf8");
    await executeCode({
      command: "git",
      args: ["config", "--global", "--add", "core.excludesfile", EXCLUDES_FN],
      bash: false,
    });
  }
}
