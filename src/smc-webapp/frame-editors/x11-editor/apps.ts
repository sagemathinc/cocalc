/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface APPS_Interface {
  [k: string]: {
    icon: string;
    desc: string;
    label?: string;
    command?: string;
    args?: string[];
  };
}

export const APPS: Readonly<APPS_Interface> = Object.freeze({
  unknown_test: {
    icon: "skull-crossbones",
    desc: "I don't exist, I'm just a test",
    label: "Unknown App",
  },
  drracket: {
    icon: "laugh",
    label: "DrRacket",
    desc:
      "Racket is a general-purpose programming language as well as the world’s first ecosystem for language-oriented programming.",
  },
  /* xclock: { icon: "clock", desc:"Shows UTC time" }, */
  emacs: {
    icon: "edit",
    desc: "An extensible, customizable, text editor — and more.",
    label: "Emacs",
  },
  gvim: { icon: "edit", desc: "The ubiquitous text editor", label: "Vim" },
  inkscape: {
    icon: "pen-fancy",
    desc: "Vector graphics editor",
    label: "Inkscape",
  },
  gimp: { icon: "pen", desc: "Image editing", label: "GIMP" },
  krita: { icon: "pen", desc: "Image editing", label: "Krita" },
  vscode: {
    label: "VS Code",
    command: "code",
    icon: "code",
    desc: "Visual Studio code",
  },
  terminal: {
    label: "Terminal",
    command: "gnome-terminal",
    icon: "terminal",
    desc: "Command line terminal",
  },
  gitk: { icon: "git", desc: "Explore Git repository in current directory" },
  gitg: { icon: "git", desc: "GNOME's client to work with Git repositories" },
  idle: {
    icon: "cc-icon-python",
    desc: "Minimalistic Python IDE",
    label: "IDLE",
  },
  okular: {
    icon: "file-pdf",
    desc: "PDF reader and annotator (Tools → Review)",
    label: "Okular",
  },
  libreoffice: {
    icon: "file-alt",
    desc:
      "A powerful office suite (spreadsheet, word processor, presentations, etc. -- open Word, Excel, Powerpoint, etc.)",
    label: "LibreOffice",
  },
  lowriter: {
    desc: "LibreOffice Writer",
    icon: "file-alt",
    label: "Writer",
  },
  localc: {
    desc: "LibreOffice Calc",
    icon: "table",
    label: "Calc",
  },
  loimpress: {
    desc: "LibreOffice Impress",
    icon: "tv",
    label: "Impress",
  },
  nteract: {
    command: "nteract",
    icon: "cube",
    desc: "A desktop Jupyter Notebook Client",
    label: "nteract",
  },
  wxmaxima: {
    icon: "square-root-alt",
    desc: "A legendary computer algebra system",
    label: "Maxima",
  },
  rstudio: {
    icon: "cc-icon-r",
    desc:
      "An integrated development environment (IDE) for R.  RStudio, Inc. is in no way affiliated with CoCalc",
    label: "RStudio",
  },
  octave: {
    icon: "cc-icon-octave",
    desc: "Scientific programming largely compatible with Matlab",
    label: "Octave",
    command: "octave",
    args: ["--force-gui"],
  },
  texmacs: {
    icon: "cc-icon-tex-file",
    desc:
      "A wysiwyw (what you see is what you want) editing platform with special features for scientists",
    label: "TeXMacs",
  },
  texstudio: {
    icon: "cc-icon-tex-file",
    desc: "An integrated writing environment for creating LaTeX documents",
    label: "TeXstudio",
  },
  openmodelica: {
    icon: "cogs",
    desc:
      "an open-source Modelica-based modeling and simulation environment intended for industrial and academic usage",
    label: "OpenModelica",
    command: "OMEdit",
  },
  pspp: {
    icon: "table",
    desc: "Statistical analysis of sampled data, similar to SPSS",
    label: "PSPP",
    command: "psppire",
  },
  gnumeric: {
    icon: "table",
    desc:
      "Gnumeric is a spreadsheet, a computer program used to manipulate and analyze numeric data",
    label: "Gnumeric",
    command: "gnumeric",
  },
  scribus: {
    icon: "address-card",
    desc: "a page layout program",
    command: "scribus",
    label: "Scribus",
  },
  spyder: {
    command: "spyder3",
    desc:
      "Spyder is a powerful scientific environment written in Python, for Python, and designed by and for scientists, engineers and data analysts.",
    icon: "calculator",
    label: "Spyder",
  },
  gchempaint: {
    desc: "GChemPaint is a 2D chemical structures editor.",
    icon: "atom",
    label: "GChemPaint",
  },
  dia: {
    desc: "Dia is a program to draw structured diagrams.",
    icon: "connectdevelop",
    label: "Dia",
  },
  pycharm: {
    command: "pycharm.sh",
    desc: "A powerful and smart IDE for productive Python development.",
    icon: "cc-icon-python",
    label: "PyCharm",
  },
  intellij: {
    label: "IntelliJ IDEA",
    desc: "A powerful and smart IDE for productive JAVA development.",
    command: "idea.sh",
    icon: "lightbulb",
  },
  sqlitebrowser: {
    label: "SQLite",
    desc:
      "A high quality, visual, open source tool to create, design, and edit database files compatible with SQLite.",
    icon: "database",
  },
  avogadro: {
    label: "Avogadro",
    desc:
      "An advanced molecule editor and visualizer designed for cross-platform use in computational chemistry, molecular modeling, bioinformatics, materials science, and related areas",
    icon: "atom",
  },
  shotwell: {
    label: "Shotwell",
    desc: "Shotwell is a personal photo manager.",
    icon: "camera",
  },
  evince: {
    label: "Evince",
    icon: "file-pdf",
    desc: "A document viewer for PDF, PostScript, DVI, DjVu, ...",
  },
  calibre: {
    label: "Calibre",
    icon: "book",
    desc: "A powerful and easy to use e-book manager",
  },
  qgis: {
    label: "QGIS",
    icon: "globe",
    desc: "A user friendly Open Source Geographic Information System.",
  },
  grass: {
    label: "GRASS",
    icon: "globe",
    desc: "Geographic Resources Analysis Support System",
  },
  ds9: {
    icon: "star",
    label: "SAOImage DS9",
    desc: "An astronomical imaging and data visualization application.",
  },
  xcas: {
    icon: "square-root-alt",
    label: "Xcas",
    desc:
      "An interface to perform computer algebra, function graphs, interactive geometry (2-d and 3-d), spreadsheet and statistics, programmation.",
  },
  "gnome-system-monitor": {
    icon: "heartbeat",
    label: "System Monitor",
    desc:
      "Shows you what programs are running and how much processor time, memory, and disk space are being used.",
  },
  gedit: {
    icon: "edit",
    label: "Gedit",
    desc: "The GNOME text editor",
  },
  scilab: {
    desc: "A free and open source software for engineers & scientists",
    label: "Scilab",
    icon: "calculator",
  },
  cadabra2: {
    command: "cadabra2-gtk",
    icon: "square-root-alt",
    label: "Cadabra 2",
    desc: "A field-theory motivated approach to computer algebra",
  },
  "vqe-playground": {
    icon: "atom",
    label: "VQE Playground",
    desc: "Gaining intuition about Variational Quantum Eigensolver",
  },
  kbibtex: {
    icon: "book-open",
    label: "KBibTeX",
    desc: "A reference management software primarily for BibTeX",
  },
});
