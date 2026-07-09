/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Handle viewing images and videos
*/

import { MediaViewer } from "./viewer";
import { register_file_editor } from "../../project-file";
import { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS } from "../../file-associations";

register_file_editor({
  ext: IMAGE_EXTS,
  icon: "file-image",
  component: MediaViewer,
});

register_file_editor({
  ext: VIDEO_EXTS,
  icon: "video-camera",
  component: MediaViewer,
});

register_file_editor({
  ext: AUDIO_EXTS,
  icon: "audio",
  component: MediaViewer,
});
