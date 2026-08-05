"""
Migrate curated level JSON from format v1 to v2.

v1 entries were [x, y, wallBits, modifier, trap, gateDir] — six slots, none of
which could hold a mimic, a liar wall or a memory-wipe zone. The RL placer
emitted those obstacles anyway, into the `modifier` slot, where the game's
loader assigned them to `cell.modifier` and every consumer that mattered
(checkTrap, the renderer's liarWalls branch) went on reading fields that stayed
false. The entire deception layer was inert.

v2 entries are [x, y, wallBits, modifier, flags, gateDir, liarBits]:
    flags    bitmask — trap 1, mimic 2, memoryWipe 4
    liarBits bitmask of sides whose visual is inverted from reality

Run:  python3 ml/export/migrate_to_v2.py
"""

import json
import os
import sys

TOP, RIGHT, BOTTOM, LEFT = 1, 2, 4, 8
SIDE_BITS = {"top": TOP, "right": RIGHT, "bottom": BOTTOM, "left": LEFT}

FLAG_TRAP, FLAG_MIMIC, FLAG_MEMORY_WIPE = 1, 2, 4

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGETS = [
    os.path.join(REPO, "public", "levels", "curated.json"),
]


def migrate_entry(entry, stats):
    """One v1 cell entry -> one v2 cell entry."""
    x, y, wall_bits = entry[0], entry[1], entry[2]
    modifier = entry[3] if len(entry) > 3 else None
    trap = entry[4] if len(entry) > 4 else 0
    gate_dir = entry[5] if len(entry) > 5 else None

    flags = FLAG_TRAP if trap else 0
    liar_bits = 0
    kept_modifier = None

    if isinstance(modifier, list):
        # ('liar_wall', {side: displayed_value}) — a key's presence means that
        # side lies. The stored value is the flipped visual, which is redundant
        # once we record the lie as an XOR against the real wall.
        kind = modifier[0] if modifier else None
        payload = modifier[1] if len(modifier) > 1 else {}
        if kind in ("liar_wall", "liarWall") and isinstance(payload, dict):
            for side in payload:
                if side in SIDE_BITS:
                    liar_bits |= SIDE_BITS[side]
            stats["liar_walls"] += 1
        else:
            stats["dropped"].append((x, y, modifier))
    elif modifier == "mimic":
        flags |= FLAG_MIMIC
        stats["mimics"] += 1
    elif modifier in ("memory_wipe", "memoryWipe"):
        flags |= FLAG_MEMORY_WIPE
        stats["memory_wipes"] += 1
    elif modifier:
        kept_modifier = modifier
        stats["modifiers"][modifier] = stats["modifiers"].get(modifier, 0) + 1

    out = [x, y, wall_bits, kept_modifier, flags, gate_dir, liar_bits]
    if out[6] == 0:
        out.pop()  # trailing zero is implied on decode
    return out


def migrate_file(path):
    with open(path) as fh:
        levels = json.load(fh)

    stats = {
        "liar_walls": 0,
        "mimics": 0,
        "memory_wipes": 0,
        "modifiers": {},
        "dropped": [],
    }

    for level in levels:
        maze = level["maze"]
        if maze.get("v", 1) >= 2:
            continue
        maze["d"] = [migrate_entry(e, stats) for e in maze["d"]]
        maze["v"] = 2

    with open(path, "w") as fh:
        json.dump(levels, fh, separators=(",", ":"))

    return stats


def main():
    for path in TARGETS:
        if not os.path.exists(path):
            print(f"skip (missing): {path}")
            continue
        stats = migrate_file(path)
        rel = os.path.relpath(path, REPO)
        print(f"migrated {rel} -> v2")
        print(f"  liar walls recovered : {stats['liar_walls']}")
        print(f"  mimics recovered     : {stats['mimics']}")
        print(f"  memory wipes         : {stats['memory_wipes']}")
        print(f"  real modifiers kept  : {stats['modifiers']}")
        if stats["dropped"]:
            print(f"  UNRECOGNISED (dropped): {stats['dropped']}", file=sys.stderr)


if __name__ == "__main__":
    main()
