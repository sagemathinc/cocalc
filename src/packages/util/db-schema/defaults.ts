/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const DEFAULT_FONT_SIZE = 14;

// key for new filenames algorithm in account/other_settings and associated default value
export const NEW_FILENAMES = "new_filenames";
export const DEFAULT_NEW_FILENAMES = "iso";

// This is used on cocalc.com, and the storage server has images named "default", "ubuntu2004" and "ubuntu2204"
// For on-prem, you have to configure the "software environment" configuration, which includes a default image name.
export const DEFAULT_COMPUTE_IMAGE = "ubuntu2204";

// this is the fallback value to use for the compute image, in case it isn't set
// in particular, for projects and public_path shares!
// historical note: we used "default" to refer to ubuntu 18.04, but once
// we switch over to 20.04, we will keep older projects on 18.04 (explicit upgrade)
export const FALLBACK_COMPUTE_IMAGE = "default";
