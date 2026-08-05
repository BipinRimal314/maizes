"""
Rebalance the curated levels so the difficulty comes from where DESIGN.md says
it should.

The shipped set did not deliver the design's thesis. Across 27 levels it had:

    102 false exits   the dominant mechanic by a factor of twenty
     72 traps         bimodal: levels had either 0-2 or 9-15
      4 mimics        inert, stranded in the modifier slot
      1 liar wall     inert, and stored as an array in a string field
      0 memory wipes  never placed at all
      5 levels        in chapters named "The Fog" and "No Mercy" with no fog

"Touch all seven red squares before the exit opens" is not decision cost, it is
a completionist chore that forces exhaustive exploration — the opposite of
making the player choose. And a level with fifteen invisible traps is not an
information problem, it is memorisation by repeated death.

This script rebalances toward the stated metric space: solution opacity,
deception density, commitment cost. It is deterministic — seeded per level by
name — so re-running it produces the same set.

Placement rules, and why:

  liar walls    on and beside the solution path. A wall drawn where there is
                none costs a detour; an opening drawn where there is a wall
                costs a commitment. Never lethal, always a decision.
  mimics        at the far end of long dead ends, never on the solution. The RL
                reward function already scored "mimic on solution" at -1.0
                because it is unfair, and it was right.
  memory wipes  deep on the solution path of foggy levels only, where losing
                the map actually costs something.
  traps         on dead ends that branch off the solution, capped hard.
  false exits   capped at two or three, kept where they are most plausible.

Every level is re-checked for solvability after placement, with gates treated
as immediately one-way, which is stricter than the game itself.

Run:  python3 ml/export/rebalance.py [--dry-run]
"""

import argparse
import json
import os
import random
import sys
from collections import deque

TOP, RIGHT, BOTTOM, LEFT = 1, 2, 4, 8
SIDE_BITS = {"top": TOP, "right": RIGHT, "bottom": BOTTOM, "left": LEFT}
OPPOSITE = {"top": "bottom", "bottom": "top", "left": "right", "right": "left"}

DELTA = {"top": (0, -1), "bottom": (0, 1), "left": (-1, 0), "right": (1, 0)}
# a gate pointing `d` blocks leaving the cell in the opposite direction
GATE_BLOCKS = {"up": "bottom", "down": "top", "left": "right", "right": "left"}

FLAG_TRAP, FLAG_MIMIC, FLAG_MEMORY_WIPE = 1, 2, 4

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGET = os.path.join(REPO, "public", "levels", "curated.json")

# Per-era budgets. The ramp is deliberate: chapter two teaches deception with no
# fog, chapter three adds blindness, chapter four combines them.
BUDGETS = {
    "learning": dict(fog=None, traps=(0, 0), fakes=(1, 2), liars=(1, 2), mimics=(0, 0), wipes=(0, 0)),
    "punishing": dict(fog=3.5, traps=(2, 5), fakes=(2, 2), liars=(2, 3), mimics=(0, 1), wipes=(0, 1)),
    "sadistic": dict(fog=3.5, traps=(3, 6), fakes=(2, 3), liars=(3, 4), mimics=(1, 2), wipes=(1, 2)),
}


class Grid:
    """A decoded level, indexed by (x, y)."""

    def __init__(self, maze):
        self.cols = maze["c"]
        self.rows = maze["r"]
        self.start = (maze["s"][0], maze["s"][1])
        self.end = (maze["e"][0], maze["e"][1])
        self.word = maze.get("w", "")
        self.walls = {}
        self.modifier = {}
        self.flags = {}
        self.gate = {}
        self.liar = {}

        for y in range(self.rows):
            for x in range(self.cols):
                self.walls[(x, y)] = 0

        for entry in maze["d"]:
            x, y, wall_bits = entry[0], entry[1], entry[2]
            self.walls[(x, y)] = wall_bits
            modifier = entry[3] if len(entry) > 3 else None
            if modifier:
                self.modifier[(x, y)] = modifier
            flags = entry[4] if len(entry) > 4 else 0
            if flags:
                self.flags[(x, y)] = flags
            gate_dir = entry[5] if len(entry) > 5 else None
            if gate_dir:
                self.gate[(x, y)] = gate_dir
            liar_bits = entry[6] if len(entry) > 6 else 0
            if liar_bits:
                self.liar[(x, y)] = liar_bits

    def in_bounds(self, cell):
        x, y = cell
        return 0 <= x < self.cols and 0 <= y < self.rows

    def can_move(self, cell, side):
        """Can the ball leave `cell` through `side`?"""
        if self.walls[cell] & SIDE_BITS[side]:
            return False
        gate_dir = self.gate.get(cell)
        if gate_dir and GATE_BLOCKS.get(gate_dir) == side:
            return False
        dx, dy = DELTA[side]
        nxt = (cell[0] + dx, cell[1] + dy)
        if not self.in_bounds(nxt):
            return False
        # walls are mirrored, but trust neither side alone
        if self.walls[nxt] & SIDE_BITS[OPPOSITE[side]]:
            return False
        return True

    def neighbours(self, cell):
        for side in ("top", "right", "bottom", "left"):
            if self.can_move(cell, side):
                dx, dy = DELTA[side]
                yield (cell[0] + dx, cell[1] + dy)

    def to_entries(self):
        entries = []
        for y in range(self.rows):
            for x in range(self.cols):
                cell = (x, y)
                wall_bits = self.walls[cell]
                modifier = self.modifier.get(cell)
                flags = self.flags.get(cell, 0)
                gate_dir = self.gate.get(cell)
                liar_bits = self.liar.get(cell, 0)
                if not (wall_bits or modifier or flags or gate_dir or liar_bits):
                    continue
                entry = [x, y, wall_bits, modifier, flags, gate_dir, liar_bits]
                if entry[6] == 0:
                    entry.pop()
                entries.append(entry)
        return entries


def shortest_path(grid):
    """BFS from start to end. Returns the path, or None if unreachable."""
    if grid.start == grid.end:
        return [grid.start]

    previous = {grid.start: None}
    queue = deque([grid.start])

    while queue:
        cell = queue.popleft()
        if cell == grid.end:
            path = []
            while cell is not None:
                path.append(cell)
                cell = previous[cell]
            return path[::-1]
        for nxt in grid.neighbours(cell):
            if nxt not in previous:
                previous[nxt] = cell
                queue.append(nxt)

    return None


def reachable_from(grid, origin):
    seen = {origin}
    queue = deque([origin])
    while queue:
        cell = queue.popleft()
        for nxt in grid.neighbours(cell):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def distances_from(grid, origin):
    dist = {origin: 0}
    queue = deque([origin])
    while queue:
        cell = queue.popleft()
        for nxt in grid.neighbours(cell):
            if nxt not in dist:
                dist[nxt] = dist[cell] + 1
                queue.append(nxt)
    return dist


def dead_end_cells(grid, solution):
    """
    Cells off the solution, ranked by how far they are down a branch. A cell
    deep in a dead end is where a player has already committed, which is what
    makes an obstacle there a decision and not a coin flip.
    """
    on_solution = set(solution)
    depth = {}
    queue = deque()

    for cell in on_solution:
        depth[cell] = 0
        queue.append(cell)

    while queue:
        cell = queue.popleft()
        for nxt in grid.neighbours(cell):
            if nxt not in depth:
                depth[nxt] = depth[cell] + 1
                queue.append(nxt)

    return {cell: d for cell, d in depth.items() if d > 0}


def farthest_cell(grid, origin):
    dist = distances_from(grid, origin)
    return max(dist.items(), key=lambda kv: kv[1])


def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def best_endpoint_pair(grid):
    """
    The pair of cells furthest apart *through the maze* that are also far apart
    *on the board*.

    Graph distance alone is not enough. Maximising it picks cells that can sit
    side by side with a wall between them — a forty-step walk to reach the
    square you are standing next to. That is precisely the shape the old fitness
    function was rewarding, and reproducing it here while fixing it there would
    be absurd. So the spatial floor applies to the replacement too.
    """
    floor = (grid.cols + grid.rows) * 0.25
    cells = [
        (x, y)
        for y in range(grid.rows)
        for x in range(grid.cols)
    ]

    best = None
    for origin in cells:
        distances = distances_from(grid, origin)
        for target, graph_distance in distances.items():
            if target == origin:
                continue
            if manhattan(origin, target) < floor:
                continue
            if best is None or graph_distance > best[2]:
                best = (origin, target, graph_distance)

    return best


def maybe_relocate_endpoints(grid):
    """
    Move a degenerate level's start and exit to opposite ends of the maze.

    Five shipped levels had the exit one or two cells from the start. They were
    selected that way: solution_opacity divided solution length by Manhattan
    distance, so a one-cell separation behind a wall scored enormously — up to
    64.0, the highest in the set. A later fix opened up walled starts and exits,
    which removed the wall and turned those levels into a single move, and the
    metric was never recomputed.

    Rather than discard the mazes, put the endpoints where the fitness function
    was pretending they already were: as far apart as the maze allows, both
    through the corridors and across the board.
    """
    path = shortest_path(grid)
    if path is None:
        return None

    # Both criteria matter, and each catches levels the other misses.
    #
    #   route     two levels had endpoints far enough apart to pass a spatial
    #             check while still being solvable in seven moves on a 12x12.
    #   distance  "No Mercy 1" has a 33-step route to an exit two cells away —
    #             a long path, but still the walled-off-next-door shape the
    #             broken fitness function was selecting for.
    route_floor = (grid.cols + grid.rows) * 0.5
    spatial_floor = (grid.cols + grid.rows) * 0.25
    separation = manhattan(grid.start, grid.end)

    if len(path) >= route_floor and separation >= spatial_floor:
        return None

    original = (grid.start, grid.end)

    pair = best_endpoint_pair(grid)
    if pair is None:
        return None
    far_a, far_b, distance = pair

    grid.start, grid.end = far_a, far_b

    # gates are one-way; the new orientation may not be traversable
    if shortest_path(grid) is None:
        grid.start, grid.end = far_b, far_a
        if shortest_path(grid) is None:
            grid.start, grid.end = original
            return None

    return {"from": original, "to": (grid.start, grid.end), "path": distance}


def clear_obstacles(grid):
    """Strip everything placement owns, keeping walls, gates, start and end."""
    grid.modifier = {}
    grid.flags = {}
    grid.liar = {}


def place_liar_walls(grid, solution, count, rng):
    """
    A lie is only interesting where the player has a choice. Prefer edges on the
    solution path, then edges one step off it.
    """
    if count <= 0:
        return 0

    candidates = []
    on_solution = set(solution)

    for cell in solution:
        for side in ("top", "right", "bottom", "left"):
            dx, dy = DELTA[side]
            nxt = (cell[0] + dx, cell[1] + dy)
            if not grid.in_bounds(nxt):
                continue
            if grid.gate.get(cell) or grid.gate.get(nxt):
                continue
            # a lie about an edge on the route is the most expensive kind
            weight = 2 if nxt in on_solution else 1
            candidates.append((weight, cell, side, nxt))

    if not candidates:
        return 0

    rng.shuffle(candidates)
    candidates.sort(key=lambda c: -c[0])

    placed = 0
    used = set()
    for _, cell, side, nxt in candidates:
        if placed >= count:
            break
        if cell in used or nxt in used:
            continue
        grid.liar[cell] = grid.liar.get(cell, 0) | SIDE_BITS[side]
        grid.liar[nxt] = grid.liar.get(nxt, 0) | SIDE_BITS[OPPOSITE[side]]
        used.add(cell)
        used.add(nxt)
        placed += 1

    return placed


def place_mimics(grid, solution, count, rng):
    """Deepest dead ends first — where a player would expect to find the exit."""
    if count <= 0:
        return 0

    depths = dead_end_cells(grid, solution)
    from_start = distances_from(grid, grid.start)

    candidates = [
        cell for cell, depth in depths.items()
        if depth >= 2 and cell != grid.end and cell != grid.start
        and from_start.get(cell, 0) >= 3
    ]
    if not candidates:
        return 0

    rng.shuffle(candidates)
    candidates.sort(key=lambda c: -(depths[c] + from_start.get(c, 0) * 0.1))

    placed = 0
    for cell in candidates[: count * 3]:
        if placed >= count:
            break
        grid.flags[cell] = grid.flags.get(cell, 0) | FLAG_MIMIC
        placed += 1
    return placed


def place_memory_wipes(grid, solution, count, rng):
    """Deep on the route, so the map you lose is one you paid for."""
    if count <= 0 or len(solution) < 6:
        return 0

    midpoint = len(solution) // 2
    candidates = [
        cell for cell in solution[midpoint:]
        if cell != grid.end and cell != grid.start and cell not in grid.gate
    ]
    if not candidates:
        return 0

    rng.shuffle(candidates)
    placed = 0
    for cell in candidates:
        if placed >= count:
            break
        if grid.flags.get(cell, 0) & (FLAG_TRAP | FLAG_MIMIC):
            continue
        grid.flags[cell] = grid.flags.get(cell, 0) | FLAG_MEMORY_WIPE
        placed += 1
    return placed


def place_traps(grid, solution, count, rng):
    """Shallow dead ends beside the route — the tempting wrong turn."""
    if count <= 0:
        return 0

    depths = dead_end_cells(grid, solution)
    candidates = [
        cell for cell, depth in depths.items()
        if 1 <= depth <= 3 and cell != grid.end
        and not (grid.flags.get(cell, 0) & FLAG_MIMIC)
    ]
    if not candidates:
        return 0

    rng.shuffle(candidates)
    placed = 0
    for cell in candidates:
        if placed >= count:
            break
        grid.flags[cell] = grid.flags.get(cell, 0) | FLAG_TRAP
        placed += 1
    return placed


def place_false_exits(grid, solution, count, rng):
    """
    Few, and plausible. Off the route, reasonably far from the start, so each
    one is a real "is that it?" moment rather than another square to mop up.
    """
    if count <= 0:
        return 0

    depths = dead_end_cells(grid, solution)
    from_start = distances_from(grid, grid.start)

    candidates = [
        cell for cell in depths
        if cell != grid.end and cell != grid.start
        and from_start.get(cell, 0) >= 4
        and not (grid.flags.get(cell, 0) & (FLAG_TRAP | FLAG_MIMIC))
    ]
    if not candidates:
        candidates = [
            cell for cell in depths
            if cell != grid.end and cell != grid.start
            and not (grid.flags.get(cell, 0) & (FLAG_TRAP | FLAG_MIMIC))
        ]
    if not candidates:
        return 0

    rng.shuffle(candidates)
    candidates.sort(key=lambda c: -from_start.get(c, 0))

    placed = 0
    for cell in candidates:
        if placed >= count:
            break
        grid.modifier[cell] = "fakeExit"
        placed += 1
    return placed


def validate(grid, level_name):
    """Every level must still be finishable, and finishable fairly."""
    problems = []

    path = shortest_path(grid)
    if path is None:
        problems.append("exit unreachable from start")
        return problems, None

    on_solution = set(path)
    reachable = reachable_from(grid, grid.start)

    for cell, flags in grid.flags.items():
        if flags & FLAG_TRAP and cell in on_solution:
            problems.append(f"trap on the solution path at {cell}")
        if flags & FLAG_MIMIC and cell in on_solution:
            problems.append(f"mimic on the solution path at {cell}")

    # every false exit must be collectable, or the real exit never unlocks
    for cell, modifier in grid.modifier.items():
        if modifier == "fakeExit" and cell not in reachable:
            problems.append(f"unreachable false exit at {cell} — exit could never unlock")

    if grid.end not in reachable:
        problems.append("exit not reachable")

    return problems, path


def rebalance_level(level, rng):
    grid = Grid(level["maze"])
    era = level.get("era", "learning")
    budget = BUDGETS.get(era, BUDGETS["learning"])

    if shortest_path(grid) is None:
        return grid, {"skipped": "unsolvable before rebalancing"}

    moved = maybe_relocate_endpoints(grid)

    path = shortest_path(grid)
    if path is None:
        return grid, {"skipped": "unsolvable after relocating endpoints"}

    clear_obstacles(grid)

    liars = place_liar_walls(grid, path, rng.randint(*budget["liars"]), rng)
    mimics = place_mimics(grid, path, rng.randint(*budget["mimics"]), rng)
    traps = place_traps(grid, path, rng.randint(*budget["traps"]), rng)
    wipes = 0
    if budget["fog"] is not None:
        wipes = place_memory_wipes(grid, path, rng.randint(*budget["wipes"]), rng)
    fakes = place_false_exits(grid, path, rng.randint(*budget["fakes"]), rng)

    return grid, {
        "liars": liars, "mimics": mimics, "traps": traps,
        "wipes": wipes, "fakes": fakes, "path": len(path), "moved": moved,
    }


def wall_map(level):
    """A maze's geometry, ignoring whatever is placed on it."""
    return {(e[0], e[1]): e[2] for e in level["maze"]["d"]}


def wall_difference(a, b):
    """Number of cells whose walls differ between two mazes."""
    return sum(1 for key in set(a) | set(b) if a.get(key) != b.get(key))


#: Two mazes this similar are the same maze with an edit, not two levels.
NEAR_DUPLICATE_CELLS = 2


def deduplicate(levels):
    """
    Drop repeated mazes and renumber the chapters.

    The curation pass that cut 62 levels down to 30 was supposed to remove
    these. "The Fog 2" and "The Fog 4" shipped byte-identical, and "The Fog 3"
    differs from "The Fog 2" by the walls of a single cell out of ninety-nine —
    which is why an exact-match dedup let it through. Three slots in a
    twelve-level chapter were the same maze.
    """
    kept = []
    dropped = []

    for level in levels:
        walls = wall_map(level)
        duplicate_of = None

        for existing in kept:
            difference = wall_difference(walls, wall_map(existing))
            if difference <= NEAR_DUPLICATE_CELLS:
                duplicate_of = (existing["name"], difference)
                break

        if duplicate_of:
            dropped.append((level["name"], duplicate_of[0], duplicate_of[1]))
            continue
        kept.append(level)

    # renumber so each chapter reads 1..n with no gaps
    counters = {}
    for level in kept:
        parts = level["name"].rsplit(" ", 1)
        if len(parts) == 2 and parts[1].isdigit():
            chapter = parts[0]
            counters[chapter] = counters.get(chapter, 0) + 1
            level["name"] = f"{chapter} {counters[chapter]}"

    return kept, dropped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(TARGET) as fh:
        levels = json.load(fh)

    levels, dropped = deduplicate(levels)
    for name, duplicate_of, difference in dropped:
        if difference == 0:
            label = f"identical maze to {duplicate_of}"
        else:
            cells = "cell" if difference == 1 else "cells"
            label = f"same maze as {duplicate_of}, differing by {difference} {cells}"
        print(f"dropped {name} — {label}")
    if dropped:
        print()

    totals = dict(liars=0, mimics=0, traps=0, wipes=0, fakes=0)
    all_problems = []
    relocated = []

    print(f"{'level':<16}{'era':<11}{'fog':<6}{'path':<6}{'liar':<6}{'mimic':<7}{'trap':<6}{'wipe':<6}{'fake':<5}")
    print("-" * 74)

    for level in levels:
        # deterministic per level, so this script is reproducible
        rng = random.Random(f"mazochist:{level['name']}")

        era = level.get("era", "learning")
        budget = BUDGETS.get(era, BUDGETS["learning"])

        grid, stats = rebalance_level(level, rng)
        if "skipped" in stats:
            all_problems.append(f"{level['name']}: {stats['skipped']}")
            continue

        problems, _ = validate(grid, level["name"])
        for problem in problems:
            all_problems.append(f"{level['name']}: {problem}")

        level["maze"]["d"] = grid.to_entries()
        # start and end move when a degenerate level is relocated; writing only
        # the cell entries silently discarded that
        level["maze"]["s"] = [grid.start[0], grid.start[1]]
        level["maze"]["e"] = [grid.end[0], grid.end[1]]
        level["maze"]["v"] = 2

        # Chapters named for a mechanic must actually have it. "The Fog" had
        # three levels with fog_radius null.
        level["fog_radius"] = budget["fog"]

        for key in totals:
            totals[key] += stats[key]
        if stats.get("moved"):
            relocated.append((level["name"], stats["moved"]))

        fog = "—" if budget["fog"] is None else f"{budget['fog']}"
        print(
            f"{level['name']:<16}{era:<11}{fog:<6}{stats['path']:<6}"
            f"{stats['liars']:<6}{stats['mimics']:<7}{stats['traps']:<6}"
            f"{stats['wipes']:<6}{stats['fakes']:<5}"
        )

    print("-" * 74)
    print(f"totals: {totals}")

    if relocated:
        print("\nrelocated endpoints on degenerate levels (exit was next door):")
        for name, move in relocated:
            print(f"  {name:<16} {move['from'][0]}->{move['from'][1]}"
                  f"  becomes  {move['to'][0]}->{move['to'][1]}"
                  f"  (path {move['path']})")

    if all_problems:
        print("\nPROBLEMS:", file=sys.stderr)
        for problem in all_problems:
            print(f"  {problem}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print("\ndry run — nothing written")
        return

    with open(TARGET, "w") as fh:
        json.dump(levels, fh, separators=(",", ":"))
    print(f"\nwrote {os.path.relpath(TARGET, REPO)}")


if __name__ == "__main__":
    main()
