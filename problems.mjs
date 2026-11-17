/**
 * Problems and their answers. A problem is a position on 19 × 19 with the side to play and a tree of
 * answers; points are SGF pairs ('aa' is the top-left corner), stones are strings of pairs.
 *
 *   { id, src, b: 'pdqd…', w: '…', play: 'B' | 'W', rank: kyu | null, tree }
 *
 * The tree is the position with you to move: each move you can play maps to what it leads to.
 *   { ok: 1 }                  the problem is solved by this move
 *   { r: 'xx', n: tree }       the opponent replies at xx, then you go on from tree
 *   { r: 'xx', ok: 1 }         the opponent's reply ends it, solved
 *   { bad: 1, r?: 'xx' }       a wrong move, with the reply that refutes it when it is known
 * A move missing from the tree is wrong too, with no reply to show.
 */
import { startPosition, play } from './rules.mjs';

export const size = 19;
export const pointOf = (pair) => (pair.charCodeAt(1) - 97) * size + pair.charCodeAt(0) - 97;
export const pairOf = (point) => String.fromCharCode(97 + (point % size), 97 + Math.floor(point / size));
export const pairsOf = (text) => (text.match(/../g) ?? []).map(pointOf);
export const colorOf = { B: 1, W: 2 };

/** The position of the problem with its side to play. */
export function problemPosition(problem) {
  const position = startPosition(size);
  for (const point of pairsOf(problem.b)) position.board[point] = 1;
  for (const point of pairsOf(problem.w)) position.board[point] = 2;
  position.toPlay = colorOf[problem.play];
  return position;
}

/**
 * What your move leads to: 'wrong' or 'solved' with the opponent's reply if there is one, or 'on'
 * with the reply and the tree to go on from.
 */
export function answer(tree, point) {
  const entry = tree[pairOf(point)];
  if (!entry || entry.bad) return { verdict: 'wrong', reply: entry?.r ? pointOf(entry.r) : null };
  const reply = entry.r ? pointOf(entry.r) : null;
  if (entry.ok) return { verdict: 'solved', reply };
  return { verdict: 'on', reply, tree: entry.n };
}

/** One correct line from the tree: your moves and the replies, to show after a mistake. */
export function solutionLine(tree) {
  const line = [];
  let node = tree;
  while (node) {
    const good = Object.entries(node).find(([, entry]) => !entry.bad);
    if (!good) break;
    const [pair, entry] = good;
    line.push(pointOf(pair));
    if (entry.r) line.push(pointOf(entry.r));
    node = entry.ok ? null : entry.n;
  }
  return line;
}

/** Plays a line of moves, the colors alternating; a move that cannot be played ends it. */
export function playLine(position, points) {
  let current = position;
  for (const point of points) {
    try { current = play(current, point); } catch { break; }
  }
  return current;
}

/** Every point the problem touches: its stones and every move in its tree. */
export function touchedPoints(problem) {
  const points = [...pairsOf(problem.b), ...pairsOf(problem.w)];
  const walk = (node) => {
    for (const [pair, entry] of Object.entries(node)) {
      points.push(pointOf(pair));
      if (entry.r) points.push(pointOf(entry.r));
      if (entry.n) walk(entry.n);
    }
  };
  walk(problem.tree);
  return points;
}

/**
 * The part of the board to show: the problem with a line of room around it, out to the edge when the
 * edge is two lines away or closer, and at least `least` lines each way.
 */
export function viewOf(problem, least = 7) {
  const points = touchedPoints(problem);
  const xs = points.map((point) => point % size);
  const ys = points.map((point) => Math.floor(point / size));
  const span = (low, high) => {
    let from = Math.max(0, low - 1);
    let to = Math.min(size - 1, high + 1);
    if (low <= 2) from = 0;
    if (high >= size - 3) to = size - 1;
    while (to - from + 1 < least) {
      if (from > 0 && (to === size - 1 || from > size - 1 - to)) from--;
      else to++;
    }
    return [from, to];
  };
  const [left, right] = span(Math.min(...xs), Math.max(...xs));
  const [top, bottom] = span(Math.min(...ys), Math.max(...ys));
  return { left, right, top, bottom };
}

/* Picking the next problem and moving the rank */
export const weakestKyu = 30;
export const strongestKyu = -8;
export const startKyu = 20;
export const rankText = (kyu) => (kyu >= 1 ? `${kyu} кю` : `${1 - kyu} дан`);
/** A solved problem takes the rank one step up, a mistake two down: you solve about two problems in three. */
export const nextKyu = (kyu, solved) => Math.min(weakestKyu, Math.max(strongestKyu, kyu + (solved ? -1 : 2)));

/**
 * A problem for the rank: one not tried yet, among the closest by difficulty, at random; when all
 * are tried, the one tried longest ago among the closest.
 */
export function pickProblem(problems, kyu, seen, random = Math.random) {
  const ranked = problems.filter((problem) => problem.rank !== null && problem.rank !== undefined);
  if (!ranked.length) return null;
  const distance = (problem) => Math.abs(problem.rank - kyu);
  const fresh = ranked.filter((problem) => !(problem.id in seen));
  const pool = fresh.length ? fresh : ranked;
  pool.sort((a, b) => distance(a) - distance(b));
  const nearest = distance(pool[0]);
  // Within half a rank of the nearest everything is as good, and at least a few to choose from.
  const choice = pool.filter((problem, index) => index < 5 || distance(problem) <= nearest + 0.5);
  if (!fresh.length) {
    choice.sort((a, b) => seen[a.id] - seen[b.id]);
    return choice[0];
  }
  return choice[Math.floor(random() * choice.length)];
}
