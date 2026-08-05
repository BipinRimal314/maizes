# Mazochist — The Maze That Fights Back

## Vision

A puzzle game where every maze is solvable but feels impossible. The difficulty comes from **information denial and decision cost**, not motor control. A trained neural network generates mazes optimized to make humans suffer.

Short-term: browser game with 100 hand-tuned + procedural levels.
Long-term: Steam release with infinite ML-generated levels and real-time difficulty adaptation.

---

## What exists today

### Core game
- **Level select** — 28 levels across 4 chapters, 3 difficulty eras
  (3 hand-crafted + 25 curated; the "100 levels across 10 chapters" this
  document used to claim was never true of the shipped build)
- **Build mode** — Grid editor, obstacle palette, share via URL hash
- **Suffer mode** — Ball physics on a fixed timestep, WASD/arrow, touch
- **Victory/shame screen** — Grade system (S to E-), stats, death quips
- **Saved progress** — completions persist in localStorage

### Difficulty systems (working)
- **Fog of war** — Can only see cells within a radius of the ball. Forces memorization.
- **Trap tiles** — Invisible. Step on one, die, get sent back. Must memorize locations.
- **Fake exits** — Must collect ALL red squares before real exit unlocks. Each one psyches you back to start.
- **One-way gates** — Passages that close behind you. No backtracking.
- **Progressive punishment** — Deaths escalate consequences: fog shrinks, new traps spawn, corruption spreads.
- **Time decay** — After 10 deaths in sadistic era, darkness spreads from start consuming the maze.

### Procedural generation
Now entirely in the Python pipeline under `ml/`. The in-browser generator
(`src/engine/generator.js`, 833 lines) was removed: nothing imported it, it had
been superseded by the ML pipeline that produces `curated.json`, and every
modifier it placed was on the retired list.

- Recursive backtracker base maze (guarantees solvability)
- Loop injection (5-15% wall removal for alternate routes)
- Seductive dead end extension (biased toward exit direction)
- Obstacle placement and rebalancing — `ml/export/rebalance.py`
- Seeded PRNG (deterministic levels)

### Design system ("The Saccharine Subversion")
- Plus Jakarta Sans + Be Vietnam Pro
- Cream palette (#fef6e4), magenta primary (#993862), cyan/yellow accents
- Gummy shadows, bouncy animations, no borders
- "The UI is a hug. The gameplay is a slap."

### Tech stack
- React 19 + Vite
- HTML5 Canvas (maze rendering + ball physics)
- Web Audio API (procedural sounds)
- No backend — maze data in URL hash

---

## What was killed (motor modifiers) — done

These modifiers affected ball control, not decision-making. They made the game
annoying, not hard. They are removed from the engine, the level data, the
builder palette and the tutorial. `engine/obstacles.js` holds the retired list
and the test suite fails if any of them reappear in a level.

| Modifier | Why it's being removed |
|----------|----------------------|
| Ice | Slightly slippery. Easily crossed. Doesn't change decisions. |
| Reverse | Annoying for 2 seconds, then you adjust. |
| Gravity wells | Mild pull, easily escaped. No real threat. |
| Fat cursor | Bigger ball, barely matters. |
| Fart tiles | Worse version of reverse with a sound. |
| Spinners | Timing window too generous. |
| Slide walls | Same — too easy to wait out. |

**The principle:** if a modifier can be overcome by "just being more careful with the controls," it's motor difficulty. Kill it.

---

## What's being built (v2 — information warfare)

Every new obstacle either **hides information**, **punishes wrong choices**, or **forces irreversible commitments**.

### New obstacle system

| Obstacle | What it does | Why it's hard |
|----------|-------------|---------------|
| **Fog of war** | Only see cells within radius of ball. Visited cells leave faint memory trail. | Can't plan ahead. Must explore and remember. |
| **Trap tiles** | Invisible death tiles on tempting wrong paths. Flash red on death, then disappear. | Punishes exploration. Must memorize locations across attempts. |
| **Fake exits** | Multiple red exit squares. Must touch all before real exit unlocks. Each one sends you back to start. | Forces full maze exploration. Can't beeline to exit. |
| **One-way gates** | Passages you can enter but not return through. | Forces commitment. Wrong choice = restart. |
| **Liar walls** | Walls that look solid but aren't. Open paths that are actually walls. | Can't trust visual information. Must probe everything. |
| **Mimic tiles** | Floor tiles that look like exits but are traps. Indistinguishable from real and fake exits. | Three-way trust problem: real exit, fake exit (collectible), mimic (death). |
| **Memory wipe zones** | Entering this zone clears your fog memory trail. Explored areas go dark again. | Destroys accumulated knowledge. Devastating in fog-heavy levels. |
| **Stalker** | A shadow that follows your exact path on a 10-second delay. If it catches you, death. | Forces forward progress. Punishes backtracking and hesitation. |
| **Decoy paths** | ML-generated paths that are longer than the solution and end in traps. Optimized to look more promising than the real path. | The wrong answer is more convincing than the right one. |
| **Checkpoint curse** | Checkpoints that save your position but also save current fog/trap/punishment state. Dying after a checkpoint restores you WITH the accumulated punishment. | Safety is a trap. |
| **Time decay** | Corruption spreads from start at 1 cell/10s. Corrupted cells become impassable. | The maze shrinks behind you. You're racing the void. |

### Difficulty eras (unchanged structure, new obstacles)

| Era | Levels | Obstacles | Death cost |
|-----|--------|-----------|------------|
| Learning (1-30) | Fog (none→partial), traps (0→4), fake exits, basic maze complexity | Progress reset |
| Punishing (31-60) | Full fog, traps (4-8), gates, liar walls, memory wipe, stalker introduced | Full reset |
| Sadistic (61-100) | Tight fog, mimics, stalker, decoy paths, checkpoint curse, all obstacles combined | Cumulative + time decay |
| Infinite (100+) | ML-generated. Adaptive difficulty. Everything. | Adaptive |

---

## ML Pipeline — Infinite Level Generation

### Architecture

```
┌─────────────────────────────────────────────────┐
│                 TRAINING (Python, offline)        │
│                                                   │
│  1. Maze Generator (VAE or Graph Neural Network)  │
│     - Input: difficulty parameters                │
│     - Output: maze topology (walls, start, end)   │
│                                                   │
│  2. Obstacle Placer (RL agent)                    │
│     - Input: maze topology + difficulty target     │
│     - Output: obstacle placement                  │
│     - Reward: simulated player suffering metric   │
│                                                   │
│  3. Difficulty Evaluator (learned metric)         │
│     - Input: complete level                       │
│     - Output: predicted difficulty score          │
│     - Trained on: human play data                 │
│                                                   │
│  4. Simulated Player (MCTS or A* with noise)     │
│     - Explores maze like a human would            │
│     - Makes mistakes, forgets, gets tricked       │
│     - Provides training signal for obstacle RL    │
│                                                   │
└──────────────┬──────────────────────────────────┘
               │ exports trained weights
               ▼
┌─────────────────────────────────────────────────┐
│              RUNTIME (game client)                │
│                                                   │
│  5. Level Generator (inference only)              │
│     - Runs trained model locally                  │
│     - Generates level in <1 second                │
│     - Parameters: target difficulty, era, seed    │
│                                                   │
│  6. Player Profiler (lightweight)                 │
│     - Tracks: deaths per level, time, backtrack   │
│       frequency, trap hit rate, hesitation time   │
│     - Outputs: player skill estimate              │
│                                                   │
│  7. Adaptive Difficulty Controller                │
│     - Input: player skill + target suffering      │
│     - Output: parameters for next level gen       │
│     - Goal: keep player in "frustrated but not    │
│       quitting" zone (flow state of suffering)    │
│                                                   │
└─────────────────────────────────────────────────┘
```

### Phase 1: Simulated player + evolutionary search (no neural network)

**Goal:** Generate levels harder than hand-designed ones using optimization.

- **Maze generator:** Constraint-based (existing algorithm, improved)
- **Obstacle placer:** Evolutionary algorithm (mutate placements, select for difficulty)
- **Simulated player:** A* pathfinder with fog simulation, memory model, and mistake probability
- **Difficulty metric:** `deaths_predicted = f(solution_length, trap_density, fog_radius, dead_end_seduction_score, gate_count, information_entropy)`

**Output:** 1,000 pre-generated levels ranked by difficulty. Exported as JSON.

**Stack:** Python 3.12, NumPy, SciPy (optimization), NetworkX (graph analysis)
**Time to build:** 1-2 sessions
**Time to generate:** ~1 hour for 1,000 levels

### Phase 2: RL-trained obstacle placement

**Goal:** Train an RL agent that places obstacles to maximize simulated player suffering.

- **Environment:** Maze grid as observation, obstacle placement as action
- **Agent:** PPO (Proximal Policy Optimization) via Stable-Baselines3
- **Reward function:** `deaths * time_taken - completion_bonus` from simulated player
- **Training:** 100K episodes (~overnight on M4 Mac)

**Output:** Trained policy network that places obstacles given any maze topology.

**Stack:** Python, PyTorch, Stable-Baselines3, Gymnasium
**Time to build:** 2-3 sessions
**Time to train:** 8-12 hours on M4

### Phase 3: Neural maze generation (VAE/GNN)

**Goal:** Generate novel maze topologies that are structurally difficult, not just randomly complex.

- **Architecture:** Variational Autoencoder on graph representation of mazes
- **Training data:** Phase 1+2 output (1000+ mazes with difficulty scores)
- **Latent space:** Difficulty is a controllable dimension — slide a parameter to make mazes harder
- **Novelty:** Each generated maze is structurally unique, not a variation of a template

**Stack:** PyTorch, PyTorch Geometric (graph neural networks)
**Time to build:** 3-4 sessions
**Time to train:** 4-8 hours

### Phase 4: Runtime adaptation

**Goal:** The game learns how you play and generates mazes that exploit YOUR specific weaknesses.

- **Player profiler:** Tracks behavioral patterns (do you always go right first? do you hesitate at intersections? do you probe walls?)
- **Weakness model:** Maps player behavior to obstacle vulnerability (player who always goes right → place traps on right-biased paths)
- **Generation loop:** After each level, generate next level targeting player's weakest dimension
- **Guard rail:** Never make it literally impossible. Keep completion rate between 60-90% (vary by era).

**Stack:** Lightweight — runs in browser. Small MLP (multi-layer perceptron) tracking ~20 behavioral features.

### Difficulty metrics (formalized)

The ML pipeline needs a mathematical definition of "hard." Here's the metric space:

| Metric | What it measures | Range |
|--------|-----------------|-------|
| **Solution opacity** | How non-obvious is the correct path? (ratio of solution length to Manhattan distance, number of direction reversals) | 1.0 (trivial) to 5.0+ (deeply hidden) |
| **Trap seduction** | How tempting are the trapped paths? (dead end length × proximity to exit ÷ solution proximity) | 0 (no traps) to 10+ (extremely tempting) |
| **Information entropy** | How much of the maze can you see at any point? (fog radius × grid size ratio) | 0 (full visibility) to 1 (nearly blind) |
| **Commitment cost** | How many one-way decisions must you make? (gate count × average distance between gates) | 0 to high |
| **Deception density** | How many things look like solutions but aren't? (fake exits + mimics + liar walls ÷ total cells) | 0 to 0.3 |
| **Recovery cost** | How much progress do you lose on death? (checkpoint distance × reset severity) | 0 (mild) to 1 (total) |
| **Time pressure** | How fast does the environment degrade? (corruption speed × maze size) | 0 (none) to critical |

**Combined difficulty score:** Weighted sum, calibrated against human play data.

> **Known metric failure — fixed.** `solution_opacity` divided solution length
> by Manhattan distance, so the cheapest way to score highly was to put the exit
> next to the start behind a wall: a one-cell separation with a long detour
> scored 14.0, and one level reached 64.0 — the highest in the set. Five of the
> 27 shipped levels were selected on that exploit. A later fix that opened up
> walled starts and exits then removed the detour without recomputing anything,
> leaving levels that advertised an opacity of 64 while being solvable in a
> single move. The metric now scores zero when start and exit are closer than a
> quarter of the board.

---

## File structure (current + planned)

```
mazochist/
├── src/                          # Game client (React + Vite)
│   ├── App.jsx
│   ├── components/
│   │   ├── MazeBuilder.jsx
│   │   ├── MazeSolver.jsx
│   │   └── LevelSelect.jsx
│   ├── engine/
│   │   ├── maze.js              # Grid data structure
│   │   ├── physics.js           # Ball movement + collision
│   │   ├── renderer.js          # Canvas drawing
│   │   ├── modifiers.js         # Obstacle trigger effects
│   │   ├── fog.js               # Fog of war + corruption
│   │   ├── sound.js             # Procedural audio
│   │   ├── generator.js         # Procedural level generation
│   │   └── levels.js            # Hand-crafted levels 1-10
│   └── utils/
│       └── serialize.js         # URL hash encoding
├── ml/                           # ML pipeline (Python) — PLANNED
│   ├── simulate/
│   │   ├── player.py            # Simulated player (A* with noise)
│   │   └── metrics.py           # Difficulty metric computation
│   ├── evolve/
│   │   ├── generator.py         # Evolutionary maze generation
│   │   └── fitness.py           # Fitness function for evolution
│   ├── train/
│   │   ├── obstacle_rl.py       # RL obstacle placement (PPO)
│   │   ├── maze_vae.py          # VAE maze topology generator
│   │   └── difficulty_model.py  # Learned difficulty predictor
│   ├── export/
│   │   └── to_json.py           # Export trained levels to game format
│   └── requirements.txt
├── levels/                       # Generated level data — PLANNED
│   ├── evolved_001-1000.json
│   └── rl_001-1000.json
├── stitch/                       # Design reference (Stitch exports)
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-03-28-true-suffering-design.md
│       └── plans/
│           └── 2026-03-28-true-suffering.md
├── DESIGN.md                     # This file
└── PLAN.md                       # Original implementation plan
```

---

## Implementation roadmap

### Done
- [x] Core game (build + solve + share)
- [x] 100 procedural levels with 10 chapters
- [x] Saccharine Subversion design system
- [x] Fog of war
- [x] Trap tiles
- [x] Fake exits (collect-all mechanic)
- [x] One-way gates
- [x] Progressive death punishment
- [x] Time decay / corruption
- [x] Imperfect maze generation (loops + seductive dead ends)
- [x] GitHub repo (BipinRimal314/mazochist)

### Next (v2 — information warfare obstacles)
- [ ] Remove motor modifiers (ice, reverse, gravity, fat cursor, fart, spinners, slide walls)
- [ ] Implement liar walls
- [ ] Implement mimic tiles
- [ ] Implement memory wipe zones
- [ ] Implement stalker shadow
- [ ] Implement checkpoint curse
- [ ] Randomize start/end positions (not always top-left / bottom-right)
- [ ] Regenerate 100 levels with new obstacle system

### Later (v3 — ML pipeline)
- [ ] Phase 1: Simulated player + evolutionary search
- [ ] Phase 2: RL-trained obstacle placement
- [ ] Phase 3: Neural maze generation (VAE)
- [ ] Phase 4: Runtime player adaptation

### Future (Steam)
- [ ] Port renderer to Godot or Unity
- [ ] Leaderboards
- [ ] Daily challenge (seeded maze, everyone plays the same one)
- [ ] Replay sharing (watch someone suffer through your maze)
- [ ] Workshop support (community-created levels)

---

## What success looks like

**v1 (now):** Someone opens the link, laughs, dies 47 times, screenshots their E- grade, and sends it to a friend.

**v2 (next):** Someone plays level 50 for 20 minutes, genuinely cannot figure out the path, walks into three traps they already knew about because the fog made them forget, and texts their friend "this game is evil."

**v3 (ML):** Every player gets a unique maze generated to exploit their specific weaknesses. The player who always goes right gets traps on the right. The player who backtracks gets a stalker. The player who memorizes well gets memory wipe zones. No two playthroughs are the same. Completion rate: 70%. Rage quit rate: 30%. Perfect suffering.

**Steam:** Mazochist is a cult hit. "Lovingly crafted suffering" becomes a meme. Someone speedruns level 100 on Twitch. The children's book aesthetic makes the cruelty funnier. Reviews say "the cutest game that ever made me scream."
