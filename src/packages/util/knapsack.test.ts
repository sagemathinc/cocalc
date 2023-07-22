import knapsack from "@cocalc/util/knapsack";

describe("knapsack", () => {
  const input = {
    banana: { c: 5, b: 33 },
    apple: { c: 1, b: 12 },
    kiwi: { c: 1, b: 7 },
  };

  it("should return the correct result for the first example", () => {
    const maxCost = 7;
    const expectedOutput = {
      items: ["kiwi", "apple", "banana"],
      cost: 7,
      benefit: 52,
    };
    const output = knapsack(input, maxCost);
    expect(output).toEqual(expectedOutput);
  });

  it("should return the correct result for the second example", () => {
    const maxCost = 2;
    const expectedOutput = {
      items: ["kiwi", "apple"],
      cost: 2,
      benefit: 19,
    };
    const output = knapsack(input, maxCost);
    expect(output).toEqual(expectedOutput);
  });

  it("should return the correct result for the third example", () => {
    const maxCost = 7;
    const expectedOutput = {
      items: ["kiwi", "apple", "banana"],
      cost: 7,
      benefit: 52,
    };
    const output = knapsack(input, maxCost);
    expect(output).toEqual(expectedOutput);
  });

  it("should return the correct result for the fourth example", () => {
    const maxCost = 20;
    const expectedOutput = {
      items: ["kiwi", "apple", "banana"],
      cost: 7,
      benefit: 52,
    };
    const output = knapsack(input, maxCost);
    expect(output).toEqual(expectedOutput);
  });

  it("should return the correct result for the fifth example", () => {
    const maxCost = 6;
    const expectedOutput = {
      items: ["apple", "banana"],
      cost: 6,
      benefit: 45,
    };
    const output = knapsack(input, maxCost);
    expect(output).toEqual(expectedOutput);
  });
});
