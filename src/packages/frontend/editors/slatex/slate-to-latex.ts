export default function toLatex(doc): string {
  let state = {};
  if (doc[0]?.type == "meta") {
    // todo -- should be yaml
    state = JSON.parse(doc[0].value);
  }
  return state.source;
  /*
  let latex = "";
  latex += "\\documentclass{article}";
  latex += "\\begin{document}";
  latex += "\\end{document}";
  return latex;
  */
}
