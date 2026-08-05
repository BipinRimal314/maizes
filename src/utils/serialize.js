/**
 * URL-hash sharing. The actual encoding lives in engine/levelFormat.js — this
 * is just the base64 wrapper around it. Keeping one codec means a shared link
 * and a bundled level can never again disagree about what a cell contains.
 */

import { encodeGrid, decodeGrid } from '../engine/levelFormat'

function gridToJSON(grid) {
  return JSON.stringify(encodeGrid(grid))
}

function jsonToGrid(json) {
  return decodeGrid(JSON.parse(json))
}

function encodeToHash(grid) {
  return btoa(encodeURIComponent(gridToJSON(grid)))
}

function decodeFromHash(hash) {
  return jsonToGrid(decodeURIComponent(atob(hash)))
}

export { gridToJSON, jsonToGrid, encodeToHash, decodeFromHash }
