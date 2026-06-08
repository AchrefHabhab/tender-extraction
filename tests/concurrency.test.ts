import { describe, it, expect } from "vitest";
import { pMap } from "../src/utils/concurrency.js";

describe("pMap", () => {
  it("processes all items and returns results in order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await pMap(items, async (x) => x * 2, 3);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("respects concurrency limit", async () => {
    let activeCalls = 0;
    let maxActive = 0;

    const items = Array.from({ length: 20 }, (_, i) => i);
    await pMap(
      items,
      async () => {
        activeCalls++;
        maxActive = Math.max(maxActive, activeCalls);
        await new Promise((r) => setTimeout(r, 10));
        activeCalls--;
      },
      3
    );

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("handles empty input", async () => {
    const results = await pMap([], async (x: number) => x, 5);
    expect(results).toEqual([]);
  });

  it("propagates errors", async () => {
    const items = [1, 2, 3];
    await expect(
      pMap(items, async (x) => {
        if (x === 2) throw new Error("fail");
        return x;
      }, 2)
    ).rejects.toThrow("fail");
  });

  it("works with concurrency of 1 (sequential)", async () => {
    const order: number[] = [];
    const items = [1, 2, 3];
    await pMap(
      items,
      async (x) => {
        order.push(x);
        await new Promise((r) => setTimeout(r, 5));
        return x;
      },
      1
    );
    expect(order).toEqual([1, 2, 3]);
  });
});
