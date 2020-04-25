//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2014 -- 2016, SageMath, Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

//###########################################
// connection to back-end hub
//###########################################

import { handle_hash_url } from "./client/handle-hash-url";

handle_hash_url();

// The following interface obviously needs to get completed,
// and then of course all of webapp client itself needs to
// be rewritten in Typescript.  In the meantime, this might
// at least prevent a typo.  When something you need from the
// actual webapp client isn't here, add it (there api is huge).

export { WebappClient, webapp_client } from "./client/client";
