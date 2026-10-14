import type { CommEdge } from "./types";

export function nodeDegrees(edges: CommEdge[]): Map<string, number> {
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.a, (deg.get(e.a) ?? 0) + e.count);
    deg.set(e.b, (deg.get(e.b) ?? 0) + e.count);
  }
  return deg;
}

// Busiest first -- same ordering used for the graph's node layout and the
// Events tab's agent grouping.
export function nodesByDegree(edges: CommEdge[]): string[] {
  const deg = nodeDegrees(edges);
  return Array.from(deg.keys()).sort((a, b) => (deg.get(b) ?? 0) - (deg.get(a) ?? 0));
}

// Unresolved @-mentions (e.g. "@george", a human with no row in `agents`)
// are kept as ids (the lowercased mentioned name) rather than dropped;
// nameById only has entries for tracked agents, so falling back to the id
// itself is already the right display behavior.
export function displayName(id: string, nameById: Map<string, string>): string {
  return nameById.get(id) ?? id;
}
