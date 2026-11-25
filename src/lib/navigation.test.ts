import { describe, expect, it } from "vitest";
import { isWorkerPath } from "./navigation";

describe("owner and worker path boundaries", () => {
  it("does not treat the owner Workers screen as the worker area", () => {
    expect(isWorkerPath("/workers")).toBe(false);
  });

  it("recognizes the worker dashboard and its child screens", () => {
    expect(isWorkerPath("/worker")).toBe(true);
    expect(isWorkerPath("/worker/history")).toBe(true);
    expect(isWorkerPath("/worker/task/a1")).toBe(true);
  });

  it("does not match unrelated paths that merely start with the same letters", () => {
    expect(isWorkerPath("/workerish")).toBe(false);
    expect(isWorkerPath("/catalogue")).toBe(false);
  });
});
