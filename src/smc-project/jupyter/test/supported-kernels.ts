/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Do some tests with **all** of the kernels we officially support in CoCalc.

Obviously, this test file should take a while to run, since it starts
up many, many kernels, several of which are old Sage versions.

Also, sadly the tests are flakie... since some Jupyter kernels are flakie.
*/

import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";

/* As of Aug, 2018:

$ jupyter kernelspec list

  anaconda3         /ext/jupyter/kernels/anaconda3
  anaconda5         /ext/jupyter/kernels/anaconda5
  bash              /ext/jupyter/kernels/bash
  calysto_prolog    /ext/jupyter/kernels/calysto_prolog
  gap               /ext/jupyter/kernels/gap
  haskell           /ext/jupyter/kernels/haskell
  ir                /ext/jupyter/kernels/ir
  ir-sage           /ext/jupyter/kernels/ir-sage
  julia             /ext/jupyter/kernels/julia
  octave            /ext/jupyter/kernels/octave
  pari_jupyter      /ext/jupyter/kernels/pari_jupyter
  python2           /ext/jupyter/kernels/python2
  python2-ubuntu    /ext/jupyter/kernels/python2-ubuntu
  python3           /ext/jupyter/kernels/python3
  sage-8.1          /ext/jupyter/kernels/sage-8.1
  sage-8.2          /ext/jupyter/kernels/sage-8.2
  sage-develop      /ext/jupyter/kernels/sage-develop
  sagemath          /ext/jupyter/kernels/sagemath
  singular          /ext/jupyter/kernels/singular
  vpython           /ext/jupyter/kernels/vpython
*/

// Set only to focus on only one of the kernels below.
const ONLY = "";

interface OneTest {
  input: string;
  output: string;
}

interface TestKernel {
  kernel: string;
  tests: OneTest[];
  timeout?: number; // in ms
}

const EXEC_TESTS: TestKernel[] = [
  {
    kernel: "anaconda3",
    tests: [
      {
        input: "print(1/3,4/3)",
        output: "0.3333333333333333 1.3333333333333333\n",
      },
    ],
  },
  {
    kernel: "anaconda5",
    tests: [
      {
        input: "print(1/3,4/3)",
        output: "0.3333333333333333 1.3333333333333333\n",
      },
    ],
  },
  {
    kernel: "bash",
    tests: [{ input: "echo 'foo bar'", output: "foo bar\n" }],
  },
  {
    kernel: "gap",
    tests: [{ input: "1/3 + 4/3", output: "5/3" }],
  },
  {
    kernel: "haskell",
    tests: [
      { input: "1/3 + 4/3", output: '{"text/plain":"1.6666666666666665"}' },
    ],
  },
  {
    kernel: "ir",
    tests: [
      {
        input: "1/3 + 4/3",
        output:
          '{"text/html":"1.66666666666667","text/latex":"1.66666666666667","text/markdown":"1.66666666666667","text/plain":"[1] 1.666667"}',
      },
    ],
  },
  {
    kernel: "ir-sage",
    tests: [
      {
        input: "1/3 + 4/3",
        output:
          '{"text/html":"1.66666666666667","text/latex":"1.66666666666667","text/markdown":"1.66666666666667","text/plain":"[1] 1.666667"}',
      },
    ],
  },
  {
    kernel: "julia",
    tests: [
      { input: "1/3 + 4/3", output: '{"text/plain":"1.6666666666666665"}' },
    ],
  },
  {
    kernel: "octave",
    tests: [{ input: "1/3 + 4/3", output: "ans =  1.6667\n" }],
  },
  {
    kernel: "pari_jupyter",
    tests: [{ input: "1/3 + 4/3", output: '{"text/plain":"5/3"}' }],
    timeout: 20000,
  },
  {
    kernel: "python2",
    tests: [{ input: "print(1/3,4/3)", output: "(0, 1)\n" }],
  },
  {
    kernel: "python2-ubuntu",
    tests: [{ input: "print(1/3,4/3)", output: "(0, 1)\n" }],
  },
  {
    kernel: "python3",
    tests: [
      {
        input: "print(1/3,4/3)",
        output: "0.3333333333333333 1.3333333333333333\n",
      },
    ],
  },
  {
    kernel: "sage-8.2",
    tests: [{ input: "1/3 + 4/3", output: '{"text/plain":"5/3"}' }],
    timeout: 60000,
  },
  {
    kernel: "sage-8.3",
    tests: [{ input: "1/3 + 4/3", output: '{"text/plain":"5/3"}' }],
    timeout: 60000,
  },
  {
    kernel: "sage-develop",
    tests: [{ input: "1/3 + 4/3", output: '{"text/plain":"5/3"}' }],
    timeout: 60000,
  },
  {
    kernel: "sagemath",
    tests: [{ input: "1/3 + 4/3", output: '{"text/plain":"5/3"}' }],
    timeout: 60000,
  },
  {
    /* Rant here: https://github.com/sagemathinc/cocalc/issues/3071 */
    kernel: "singular",
    tests: [
      {
        input: "2 + 3",
        output:
          '{"text/plain":"5\\n   skipping text from `(` error at token `)`\\n"}',
      },
    ],
    timeout: 30000,
  },
  {
    kernel: "vpython",
    tests: [
      {
        input: "print(1/3,4/3)",
        output: "0.3333333333333333 1.3333333333333333\n",
      },
    ],
  },
];

for (const test of EXEC_TESTS) {
  if (ONLY && ONLY != test.kernel) {
    continue;
  }
  describe(`tests the "${test.kernel}" kernel -- `, function () {
    before(common.default_kernel_path);
    after(common.custom_kernel_path);
    this.timeout(test.timeout ? test.timeout : 20000);

    let kernel: common.JupyterKernel;

    it(`creates the "${test.kernel}" kernel`, function () {
      kernel = common.kernel(test.kernel);
    });

    for (const { input, output } of test.tests) {
      it(`evaluates "${input}"`, async function () {
        expect(await common.exec(kernel, input)).toBe(output);
      });
    }

    it(`closes the ${test.kernel} kernel`, function () {
      kernel.close();
    });
  });
}
