import { describe, expect, it } from "vitest";
import { unbackedNumbers, verifyFacts } from "./advisor";

describe("advisor fact check", () => {
  const outputs = [
    { name: "get_sales", output: JSON.stringify({ dealsWon: 2, wonByCurrency: { USD: 12000 }, connectRate: 0.38 }) },
    { name: "get_products", output: JSON.stringify([{ name: "InvoiceBot", recommendation: "invest" }]) },
  ];

  it("verifies facts only against the tool they cite", () => {
    const v = verifyFacts(
      [
        { statement: "Two deals were won", source: "get_sales", evidence: "dealsWon\":2" },
        { statement: "Won 12,000 USD", source: "get_sales", evidence: "12,000" },
        { statement: "InvoiceBot should get investment", source: "get_products", evidence: "InvoiceBot" },
        { statement: "Revenue doubled", source: "get_sales", evidence: "24000" },
        { statement: "Habits are strong", source: "get_habits", evidence: "90%" },
        { statement: "InvoiceBot named in sales", source: "get_sales", evidence: "InvoiceBot" },
      ],
      outputs,
    );
    expect(v.map((f) => f.verified)).toEqual([true, true, true, false, false, false]);
    expect(v[4].reason).toMatch(/didn't read "get_habits"/);
  });

  it("flags numbers in the answer that no verified fact supports", () => {
    const facts = verifyFacts([{ statement: "Won 12,000 USD from 2 deals", source: "get_sales", evidence: "12000" }], outputs);
    expect(unbackedNumbers("You won 12,000 USD from 2 deals in 2026, and revenue is up 40%.", facts)).toEqual(["40%"]);
    const words = verifyFacts([{ statement: "Three products are active", source: "get_products", evidence: "InvoiceBot" }], outputs);
    expect(unbackedNumbers("3 products, 4 launched.", words)).toEqual(["4"]);
  });
});
