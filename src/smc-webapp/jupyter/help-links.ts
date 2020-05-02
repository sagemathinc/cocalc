/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface Help {
  [key: string]: string;
}

const LINKS: { [key: string]: Help } = {
  python: {
    Python: "https://docs.python.org/3/",
    IPython: "https://ipython.org/documentation.html",
    NumPy: "https://docs.scipy.org/doc/numpy/reference/",
    SciPy: "https://docs.scipy.org/doc/scipy/reference/",
    matplotlib: "https://matplotlib.org/contents.html",
    SymPy: "https://docs.sympy.org/latest/",
    pandas: "http://pandas.pydata.org/pandas-docs/stable/",
    SageMath: "http://doc.sagemath.org/",
    "scikit-learn": "https://scikit-learn.org/stable/",
    statsmodels: "https://www.statsmodels.org/stable/",
    tensorflow: "https://www.tensorflow.org/learn",
  },
  r: {
    R: "https://www.r-project.org/",
    "R Jupyter Kernel": "https://irkernel.github.io/faq/",
    Bioconductor: "https://www.bioconductor.org/",
    tidyverse: "https://www.tidyverse.org/",
    ggplot2: "https://ggplot2.tidyverse.org/",
    dplyr: "https://dplyr.tidyverse.org",
    "data.table": "https://github.com/Rdatatable/data.table/wiki",
  },
  bash: {
    Bash: "https://tiswww.case.edu/php/chet/bash/bashtop.html",
    "Linux Tutorial": "https://ryanstutorials.net/linuxtutorial/",
  },
  julia: {
    "Julia Documentation": "https://docs.julialang.org/en/stable/",
    Plots: "https://docs.juliaplots.org/latest/",
    DataFrames: "https://juliadata.github.io/DataFrames.jl/stable/",
    JuMP: "http://www.juliaopt.org/JuMP.jl/stable/",
  },
  octave: {
    Octave: "https://www.gnu.org/software/octave/",
    "Octave Documentation":
      "https://www.gnu.org/software/octave/doc/interpreter/",
    "Octave Tutorial":
      "https://en.wikibooks.org/wiki/Octave_Programming_Tutorial",
    "Octave FAQ": "http://wiki.octave.org/FAQ",
  },
  postgresql: {
    PostgreSQL: "https://www.postgresql.org/docs/",
    "PostgreSQL Jupyter Kernel":
      "https://github.com/bgschiller/postgres_kernel",
  },
  scala: {
    "Scala Documentation": "https://docs.scala-lang.org/",
  },
  singular: {
    "Singular Manual":
      "https://www.singular.uni-kl.de/index.php/singular-manual.html",
  },
};

// "lang" is coming from kernel_info.get("language")
export function get_help_links(lang: string | undefined): Help | undefined {
  if (typeof lang != "string") return; // since not everything is typescript...
  // sanitize, e.g. the language might be uppercase "R"
  lang = lang.toLowerCase();
  // special case: "scala211" might change version info
  if (lang.startsWith("scala")) {
    lang = "scala";
  }
  return LINKS[lang];
}
