import { evaluateArithmeticExpression } from "../../../mcp/McpServer";

describe("McpServer arithmetic evaluator", () => {
  it("evaluates basic expressions with precedence", () => {
    expect(evaluateArithmeticExpression("1 + 2 * 3")).toBe(7);
    expect(evaluateArithmeticExpression("(1 + 2) * 3")).toBe(9);
    expect(evaluateArithmeticExpression("7 / 2")).toBe(3.5);
    expect(evaluateArithmeticExpression("-3 + 5")).toBe(2);
    expect(evaluateArithmeticExpression("-(1+2)")).toBe(-3);
  });

  it("rejects unsupported characters and code injection payloads", () => {
    expect(() => evaluateArithmeticExpression("process.exit(1)")).toThrow(
      "Unsupported character",
    );
    expect(() =>
      evaluateArithmeticExpression("1 + globalThis.constructor"),
    ).toThrow("Unsupported character");
  });

  it("rejects invalid arithmetic inputs", () => {
    expect(() => evaluateArithmeticExpression("")).toThrow(
      "Expression is empty",
    );
    expect(() => evaluateArithmeticExpression("1 / 0")).toThrow(
      "Division by zero",
    );
    expect(() => evaluateArithmeticExpression("(1 + 2")).toThrow(
      "Mismatched parentheses",
    );
  });
});
