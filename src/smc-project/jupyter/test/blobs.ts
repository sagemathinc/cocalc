/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";

const misc_node = require("smc-util-node/misc_node");

import { blob_store } from "../jupyter-blobs-sqlite";

describe("very basic tests of the blob store -- ", function () {
  blob_store.delete_all_blobs();

  it("gets a list of blobs (which should be empty)", () =>
    expect(blob_store.keys()).toEqual([]));

  // got via
  // require('./jupyter').kernel(name:'sage-7.4', verbose:false).execute_code(code:'point((0,0), axes=False, figsize=1)', all:true, cb:(e,m)->console.log(m[2].content.data))
  const blob =
    "iVBORw0KGgoAAAANSUhEUgAAAFkAAAA4CAYAAACWo1RQAAAABHNCSVQICAgIfAhkiAAAAAlwSFlz\nAAAPYQAAD2EBqD+naQAAAQVJREFUeJzt2iEOwjAcRvEPwuSSSY4AbmbciFNxil0DhYNj4CeGmAAc\nCF7T8H7JkrXqn5emqqt5nufop9alB/gHRgYYGWBkgJEBRgYYGWBkgJEBRgYYGWBkgJEBRgYYGWBk\ngJEBRgYYGWBkgJEBRgYYGWBkwKb0AN+435PTafk/HpOuKzvPp1a1vCCapuRwSC6XZd33yfmcNE3Z\nuT5RTeTbLdnv3/eu12S3KzPPN6q5k7fbpG2f67Zd9mpQTeSuS8YxGYblG0fvZL2o5iTXzMgAIwOM\nDDAywMgAIwOMDDAywMgAIwOMDDAywMgAIwOMDDAywMgAIwOMDDAywMgAIwOMDDAy4AEJciLL9Myg\nZwAAAABJRU5ErkJggg==\n";
  const buffer = new Buffer(blob, "base64");
  const sha1 = misc_node.sha1(buffer);

  it("saves a blob", function () {
    expect(blob_store.save(blob, "image/png")).toBe(sha1);
    return expect(blob_store.keys()).toEqual([sha1]);
  });

  it("reads a blob", () => expect(blob_store.get(sha1)).toEqual(buffer));
});
