import { expect, test } from "vitest";
import { drawChanges, drawHealth, revealState } from "@/lib/draw-state";

test("before any draw there is nothing to reveal", () => {
  expect(revealState({ drawnAt: null, isParticipant: false, hasMatch: false })).toBe("none");
});

test("someone who joined after the draw is not in it yet", () => {
  expect(revealState({ drawnAt: "2026-12-01", isParticipant: false, hasMatch: false })).toBe("not-in-draw");
});

test("a participant whose match was removed is told to ask for a redraw", () => {
  expect(revealState({ drawnAt: "2026-12-01", isParticipant: true, hasMatch: false })).toBe("match-left");
});

test("a participant with a match can reveal it", () => {
  expect(revealState({ drawnAt: "2026-12-01", isParticipant: true, hasMatch: true })).toBe("ok");
});

test("draw health", () => {
  expect(drawHealth({ participants: 0, matches: 0 })).toBe("none");
  expect(drawHealth({ participants: 3, matches: 3 })).toBe("complete");
  expect(drawHealth({ participants: 2, matches: 1 })).toBe("incomplete");
});

test("people waiting to be included are those ticked in but not in the current draw", () => {
  const members = [
    { id: "olive", inDraw: true },
    { id: "late", inDraw: true },
    { id: "grandma", inDraw: false },
    { id: "sam", inDraw: false },
  ];
  const changes = drawChanges(members, new Set(["olive", "sam"]));
  expect(changes.waiting).toEqual(["late"]);
  expect(changes.tickedOut).toEqual(["sam"]);
});

test("nothing is flagged when the draw matches the ticks", () => {
  expect(drawChanges([{ id: "a", inDraw: true }, { id: "g", inDraw: false }], new Set(["a"]))).toEqual({ waiting: [], tickedOut: [] });
});
