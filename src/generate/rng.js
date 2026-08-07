/**
 * Seeded pseudo-randomness.
 *
 * Every level is a pure function of its seed, so a level that passes the oracle
 * once passes it forever, and any level can be reproduced from a single number
 * when something looks wrong.
 */

/** mulberry32 — small, fast, good enough for level layout. */
function createRng(seed) {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  next.int = (maxExclusive) => Math.floor(next() * maxExclusive)
  next.range = (min, maxInclusive) => min + next.int(maxInclusive - min + 1)
  next.pick = (array) => array[next.int(array.length)]

  next.shuffle = (array) => {
    const out = array.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = next.int(i + 1)
      const swap = out[i]
      out[i] = out[j]
      out[j] = swap
    }
    return out
  }

  return next
}

export { createRng }
