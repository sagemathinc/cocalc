/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Handle viewing images and videos
*/

import { MediaViewer } from "./viewer";
import { register_file_editor } from "../../project-file";
import { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS } from "../../file-associations";

for (const is_public of [true, false]) {
  register_file_editor({
    ext: IMAGE_EXTS,
    icon: "file-image-o",
    component: MediaViewer,
    is_public,
  });

  register_file_editor({
    ext: VIDEO_EXTS,
    icon: "file-video-o",
    component: MediaViewer,
    is_public,
  });

  register_file_editor({
    ext: AUDIO_EXTS,
    icon: "file-audio-o",
    component: MediaViewer,
    is_public,
  });
}
