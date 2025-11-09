/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const DEFAULT_FONT_SIZE = 14;

export type NewFilenameTypes =
  | "iso"
  | "heroku"
  | "pet"
  | "ymd_heroku"
  | "ymd_pet"
  | "semantic"
  | "ymd_semantic";

// key for new filenames algorithm in account/other_settings and associated default value
export const NEW_FILENAMES = "new_filenames";
export const DEFAULT_NEW_FILENAMES: NewFilenameTypes = "iso";

// This is used on cocalc.com, and the storage server has images named "default", "ubuntu2004" and "ubuntu2204"
// For on-prem, you have to configure the "software environment" configuration, which includes a default image name.
export const DEFAULT_COMPUTE_IMAGE = "ubuntu2404";

// this is the fallback value to use for the compute image, in case it isn't set
// in particular, for projects and public_path shares!
// historical note: we used "default" to refer to ubuntu 18.04, but once
// we switch over to 20.04, we will keep older projects on 18.04 (explicit upgrade)
export const FALLBACK_COMPUTE_IMAGE = "default";

export const DEFAULT_PROJECT_IMAGE = "ubuntu:25.10";

// directory that contains overlay modifications to roofs filesystem image.
// It stores them in PROJECT_IMAGE_PATH/{compute_server_id}
// Obviously do NOT change this willy nilly for an existing install, since
// it would cause all existing data to vanish...
export const PROJECT_IMAGE_PATH = ".local/share/overlay";

export const OTHER_SETTINGS_USERDEFINED_LLM = "userdefined_llm";
