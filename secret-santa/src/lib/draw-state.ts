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
