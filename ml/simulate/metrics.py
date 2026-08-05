"""Difficulty metrics for maze evaluation.

Seven dimensions of suffering, computed from maze structure.
These are the fitness targets for the evolutionary generator.
"""

import numpy as np
from collections import deque
from .maze import Maze, solve_bfs, DIRECTION


#: Below this fraction of (cols + rows), start and exit are too close together
#: for the ratio below to mean anything.
MIN_SEPARATION_FRACTION = 0.25


def solution_opacity(maze):
    """How non-obvious is the correct path?

    Ratio of actual solution length to Manhattan distance.
    Higher = more winding, less intuitive.
    A straight-line maze scores ~1.0. A deeply hidden solution scores 3-5+.

    The separation floor is not cosmetic. This metric fed the evolutionary
    fitness function, and dividing by Manhattan distance meant the cheapest way
    to score well was to put the exit next to the start behind a wall: a
    one-cell separation with a fourteen-step detour scored 14.0, and one level
    reached 64.0 that way. Five of the twenty-seven shipped levels were selected
    on that exploit. A later fix that opened up walled starts and exits then
    removed the detour without anyone recomputing the metric, leaving levels
    that claimed an opacity of 64 while being solvable in a single move.

    A level whose exit is next door is not opaque, however winding the long way
    round happens to be. It scores zero.
    """
    solution = solve_bfs(maze)
    if not solution:
        return 0.0
    manhattan = abs(maze.end[0] - maze.start[0]) + abs(maze.end[1] - maze.start[1])
    if manhattan == 0:
        return 0.0

    min_separation = (maze.cols + maze.rows) * MIN_SEPARATION_FRACTION
    if manhattan < min_separation:
        return 0.0

    # count direction reversals in solution
    reversals = 0
    for i in range(2, len(solution)):
        dx1 = solution[i - 1][0] - solution[i - 2][0]
        dy1 = solution[i - 1][1] - solution[i - 2][1]
        dx2 = solution[i][0] - solution[i - 1][0]
        dy2 = solution[i][1] - solution[i - 1][1]
        # reversal = going in the opposite direction from previous step
        if (dx1 == -dx2 and dy1 == -dy2) and (dx1 != 0 or dy1 != 0):
            reversals += 1

    length_ratio = len(solution) / max(manhattan, 1)
    reversal_bonus = reversals * 0.3

    return length_ratio + reversal_bonus


def trap_seduction(maze):
    """How tempting are the trapped paths?

    Measures how much a trap path looks like the solution.
    Dead end length × proximity to exit ÷ solution path proximity.
    Higher = traps are on paths that look more promising than the solution.
    """
    if not maze.traps:
        return 0.0

    solution = solve_bfs(maze)
    if not solution:
        return 0.0
    solution_set = set(solution)

    score = 0.0
    for trap_x, trap_y in maze.traps:
        # find how far you can walk toward this trap from the solution
        # (how "seductive" the wrong turn is)
        trap_dist_to_exit = abs(trap_x - maze.end[0]) + abs(trap_y - maze.end[1])

        # find nearest solution cell
        min_sol_dist = min(
            abs(trap_x - sx) + abs(trap_y - sy)
            for sx, sy in solution
        )

        # closer to exit than nearby solution cells = more seductive
        nearby_sol = [(sx, sy) for sx, sy in solution
                      if abs(trap_x - sx) + abs(trap_y - sy) <= 3]
        if nearby_sol:
            avg_sol_dist_to_exit = np.mean([
                abs(sx - maze.end[0]) + abs(sy - maze.end[1])
                for sx, sy in nearby_sol
            ])
            # if trap is closer to exit than nearby solution, it's seductive
            if trap_dist_to_exit < avg_sol_dist_to_exit:
                score += (avg_sol_dist_to_exit - trap_dist_to_exit) / max(avg_sol_dist_to_exit, 1)

        # proximity bonus — traps near the solution path are more dangerous
        if min_sol_dist <= 2:
            score += 1.0

    return score / max(len(maze.traps), 1)


def information_entropy(maze, fog_radius=None):
    """How much of the maze can you see at any point?

    Fog radius relative to grid size.
    0 = full visibility (easy). 1 = nearly blind (hard).
    """
    if fog_radius is None:
        return 0.0

    # what fraction of cells is visible from center
    max_visible = np.pi * fog_radius ** 2
    total_cells = maze.cols * maze.rows
    visibility_ratio = min(max_visible / total_cells, 1.0)

    return 1.0 - visibility_ratio


def commitment_cost(maze):
    """How many irreversible decisions must you make?

    Gate count × average distance between gates on solution path.
    Higher = more one-way decisions with more consequences.
    """
    if not maze.gates:
        return 0.0

    solution = solve_bfs(maze)
    if not solution:
        return 0.0

    gate_positions = [i for i, (x, y) in enumerate(solution) if (x, y) in maze.gates]
    if not gate_positions:
        return float(len(maze.gates)) * 0.5  # gates exist but not on solution

    # average spacing between gates on solution path
    if len(gate_positions) > 1:
        spacings = [gate_positions[i + 1] - gate_positions[i] for i in range(len(gate_positions) - 1)]
        avg_spacing = np.mean(spacings)
    else:
        avg_spacing = len(solution)

    return len(maze.gates) * (avg_spacing / len(solution))


def deception_density(maze):
    """How many things look like solutions but aren't?

    Fake exits + traps divided by total cells.
    Higher = more deception per unit area.
    """
    deceptive_cells = len(maze.fake_exits) + len(maze.traps)
    return deceptive_cells / maze.size


def dead_end_analysis(maze):
    """Analyze dead end characteristics.

    Returns dict with dead end count, max length, and seduction score.
    """
    solution = solve_bfs(maze)
    if not solution:
        return {"count": 0, "max_length": 0, "avg_length": 0, "seduction": 0}

    solution_set = set(solution)

    # find all dead ends (cells with only one opening)
    dead_ends = []
    for y in range(maze.rows):
        for x in range(maze.cols):
            if (x, y) in solution_set:
                continue
            openings = len(maze.neighbors(x, y))
            if openings == 1:
                dead_ends.append((x, y))

    if not dead_ends:
        return {"count": 0, "max_length": 0, "avg_length": 0, "seduction": 0}

    # trace each dead end back to find its length
    lengths = []
    seduction_scores = []
    for dx, dy in dead_ends:
        # walk from dead end back toward an intersection
        length = 1
        cx, cy = dx, dy
        visited = {(cx, cy)}
        while True:
            neighbors = [(nx, ny) for nx, ny, _ in maze.neighbors(cx, cy) if (nx, ny) not in visited]
            if len(neighbors) != 1:
                break
            cx, cy = neighbors[0]
            visited.add((cx, cy))
            length += 1

        lengths.append(length)

        # seduction: does this dead end point toward the exit?
        dist_start = abs(dx - maze.start[0]) + abs(dy - maze.start[1])
        dist_end = abs(dx - maze.end[0]) + abs(dy - maze.end[1])
        if dist_end < dist_start:
            seduction_scores.append(length * (1 - dist_end / max(dist_start + dist_end, 1)))
        else:
            seduction_scores.append(0)

    return {
        "count": len(dead_ends),
        "max_length": max(lengths),
        "avg_length": np.mean(lengths),
        "seduction": np.mean(seduction_scores) if seduction_scores else 0,
    }


def compute_all_metrics(maze, fog_radius=None):
    """Compute all difficulty metrics for a maze. Returns dict."""
    de = dead_end_analysis(maze)

    return {
        "solution_opacity": solution_opacity(maze),
        "trap_seduction": trap_seduction(maze),
        "information_entropy": information_entropy(maze, fog_radius),
        "commitment_cost": commitment_cost(maze),
        "deception_density": deception_density(maze),
        "dead_end_count": de["count"],
        "dead_end_max_length": de["max_length"],
        "dead_end_avg_length": de["avg_length"],
        "dead_end_seduction": de["seduction"],
        "total_cells": maze.size,
        "solvable": len(solve_bfs(maze)) > 0,
    }


def difficulty_score(metrics, weights=None):
    """Weighted difficulty score from metrics dict.

    Higher = harder. Designed so a trivial maze scores ~1 and
    a sadistic maze scores 50+.
    """
    if weights is None:
        weights = {
            "solution_opacity": 5.0,
            "trap_seduction": 8.0,
            "information_entropy": 15.0,
            "commitment_cost": 10.0,
            "deception_density": 20.0,
            "dead_end_seduction": 3.0,
        }

    score = 0.0
    for key, weight in weights.items():
        score += metrics.get(key, 0) * weight

    # bonus for unsolvable-looking mazes that are actually solvable
    if metrics.get("solvable") and metrics.get("solution_opacity", 0) > 3:
        score *= 1.2

    return score
