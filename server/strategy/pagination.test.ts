import { describe, expect, it } from "vitest";
import { pageDescendingSequences } from "./pagination";

describe("historical cursor pagination", () => {
  it("returns a chronological page and exposes an older boundary when limit plus one rows are present", () => { const result = pageDescendingSequences([{ sequence: 9 }, { sequence: 8 }, { sequence: 7 }], 2); expect(result.hasMoreOlder).toBe(true); expect(result.page.map((item) => item.sequence)).toEqual([8, 9]); });
  it("does not claim another page at the oldest exact boundary", () => { const result = pageDescendingSequences([{ sequence: 2 }, { sequence: 1 }], 2); expect(result.hasMoreOlder).toBe(false); expect(result.page.map((item) => item.sequence)).toEqual([1, 2]); });
});
