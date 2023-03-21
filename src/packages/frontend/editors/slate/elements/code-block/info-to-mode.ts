import { file_associations } from "@cocalc/frontend/file-associations";
import detectLanguage from "@cocalc/frontend/misc/detect-language";

export default function infoToMode(
  info: string | undefined | null,
  value?: string
): string {
  info = info?.trim().toLowerCase();
  if (!info) {
    if (!value) return "txt";
    info = detectLanguage(value);
  }

  if (info[0] == "{") {
    // Rmarkdown format -- looks like {r stuff,engine=python,stuff}.
    // https://github.com/yihui/knitr-examples/blob/master/023-engine-python.Rmd
    // TODO: For now just do this, but find a spec and parse in the future...
    info = "r";
  }
  const spec = file_associations[info];
  return spec?.opts.mode ?? info; // if nothing in file associations, maybe info is the mode, e.g. "python".
}
