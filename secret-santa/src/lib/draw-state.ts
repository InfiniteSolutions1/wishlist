export type RevealState = "none" | "not-in-draw" | "match-left" | "ok";

/** What the "You are buying for" card should show for the signed-in person. */
export function revealState(input: { drawnAt: string | null; isParticipant: boolean; hasMatch: boolean }): RevealState {
  if (!input.drawnAt) return "none";
  if (!input.isParticipant) return "not-in-draw";
  return input.hasMatch ? "ok" : "match-left";
}

export type DrawHealth = "none" | "complete" | "incomplete";

/** Whether the current draw still has a match for everyone who took part. */
export function drawHealth(status: { participants: number; matches: number }): DrawHealth {
  if (status.participants === 0) return "none";
  return status.matches === status.participants ? "complete" : "incomplete";
}

/**
 * How the ticks differ from the current draw.
 * waiting: ticked in but not in the draw (joined or ticked afterwards).
 * tickedOut: still in the draw but now unticked.
 * Either one means a redraw is needed for the ticks to take effect.
 */
export function drawChanges(
  members: { id: string; inDraw: boolean }[],
  participants: Set<string>,
): { waiting: string[]; tickedOut: string[] } {
  return {
    waiting: members.filter((m) => m.inDraw && !participants.has(m.id)).map((m) => m.id),
    tickedOut: members.filter((m) => !m.inDraw && participants.has(m.id)).map((m) => m.id),
  };
}
