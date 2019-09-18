## Issue Triage
Contributors with sufficient permissions on the CoCalc repo can help by adding
labels to triage issues:

* Yellow, **A**-prefixed labels state which **area** of CoCalc the issue relates to. It answers the question: "Where should I be looking?"

* Green, **E**-prefixed labels explain the type of **experience** necessary
  to fix the issue. It answers the question "What kind of effort is necessary?"

* Red, **I**-prefixed labels indicate the **importance** (relevance) of the issue. It answers the question: "Why is this important?"

* **M** is market segment priority. 

* Orange, **P**-prefixed labels indicate a bug's **priority**.

* The purple **meta** label denotes a list of issues collected from other categories.

* The black, **blocked** label denotes an issue blocked by another.

* Finally, **upstream** signals the problem is related to a library, usually includes a link to another issue.

If you're looking for somewhere to start, check out the [E-easy][eeasy] tag.

[eeasy]:https://github.com/sagemathinc/cocalc/labels/E-easy

### List of labels and their descriptions
Most tags should be self explanatory but some can be unclear. If you're unsure what a label means how it's different from another email John Jeng at j3@sagemath.com. He'll probably add it to the description here.

- `blocked` -- Always link what the issue is blocked by.
- `I-bug` -- Something that is clearly wrong based on what the UI tells you or on strongly expected behavior by the majority of people.
- `I-enhancement` -- Making something in CoCalc better.
- `I-feature request` -- Adding some new component to CoCalc
- `I-slow` -- Something that seems unnecessarily slow.
- `I-software request` -- Requests for adding something to be installed in CoCalc by default.
- `I-UA` -- Text that needs to be reworded or a tip that needs to get written.


Inspired by [Rust's triage system](https://github.com/rust-lang/rust/blob/master/CONTRIBUTING.md#issue-triage).
