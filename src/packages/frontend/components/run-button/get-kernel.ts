import { getKernelInfo } from "./kernel-info";
import { guesslang } from "@cocalc/frontend/misc/detect-language";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import { closest_kernel_match } from "@cocalc/util/misc";
import { fromJS } from "immutable";
import { field_cmp } from "@cocalc/util/misc";

export default async function getKernel({
  input,
  history,
  info,
  project_id,
}): Promise<string> {
  return await guessKernel({
    info,
    code: (history ?? []).concat([input ?? ""]).join("\n"),
    project_id,
  });
}

async function guessKernel({ info, code, project_id }): Promise<string> {
  const kernelInfo = await getKernelInfo(project_id);
  if (kernelInfo.length == 0) {
    throw Error("there are no available kernels");
  }
  if (!info) {
    // we guess something since nothing was giving. We use the code in the input and history.
    const guesses = await guesslang(code);
    // TODO: should restrict guesses to available kernels...
    info = guesses[0] ?? "py";
  }

  const mode = infoToMode(info, { preferKernel: true });
  const matches: { name: string; priority: number }[] = [];
  for (const { name, display_name, language, metadata } of kernelInfo) {
    if (name == mode) {
      // mode **exactly** matches a known kernel, so obviously use that.
      return name;
    }
    if (mode == language || mode == display_name.toLowerCase()) {
      matches.push({ name, priority: metadata?.cocalc?.priority ?? 0 });
    }
  }
  if (matches.length > 0) {
    matches.sort(field_cmp("priority"));
    return matches[matches.length - 1].name;
  }
  // No really clear match, so use closest_kernel_match.
  // TODO: it's silly converting to immutable.js constantly...
  return closest_kernel_match(mode, fromJS(kernelInfo)).get("name");
}
