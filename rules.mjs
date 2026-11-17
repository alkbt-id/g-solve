/**
 * Go rules on a flat board: captures, no suicide, simple ko. A point is `y * size + x` from the
 * top-left corner, `null` is a pass; 1 is black, 2 is white.
 */

/** The empty board, or black's handicap stones on it with white to move. */
export function startPosition(size, stones = []) {
  const board = new Array(size * size).fill(0);
  for (const point of stones) board[point] = 1;
  return { size, board, toPlay: stones.length ? 2 : 1, captured: { 1: 0, 2: 0 }, before: null, passes: 0, last: null };
}

export function neighbors(point, size) {
  const x = point % size;
  const list = [];
  if (x > 0) list.push(point - 1);
  if (x < size - 1) list.push(point + 1);
  if (point >= size) list.push(point - size);
  if (point < size * (size - 1)) list.push(point + size);
  return list;
}

/** Stones of the group on `start` and whether it has a liberty. */
function groupOf(board, start, size) {
  const color = board[start];
  const stones = new Set([start]);
  const stack = [start];
  let free = false;
  while (stack.length) {
    for (const point of neighbors(stack.pop(), size)) {
      if (board[point] === 0) free = true;
      else if (board[point] === color && !stones.has(point)) {
        stones.add(point);
        stack.push(point);
      }
    }
  }
  return { stones, free };
}

/** The position after the side to move plays `point`; an illegal move throws with the reason. */
export function play(position, point) {
  const { size, toPlay: color } = position;
  const next = { size, board: [...position.board], toPlay: 3 - color, captured: { ...position.captured }, before: position.board, passes: 0, last: point };
  if (point === null) return { ...next, passes: position.passes + 1 };
  if (!Number.isInteger(point) || point < 0 || point >= size * size) throw new Error('Ход за пределами доски.');
  if (position.board[point]) throw new Error('Точка занята.');
  next.board[point] = color;
  for (const near of neighbors(point, size)) {
    if (next.board[near] !== 3 - color) continue;
    const { stones, free } = groupOf(next.board, near, size);
    if (free) continue;
    for (const stone of stones) next.board[stone] = 0;
    next.captured[color] += stones.size;
  }
  if (!groupOf(next.board, point, size).free) throw new Error('Самоубийственный ход запрещён.');
  // Simple ko: a move may not bring back the board as it was before the opponent's last move.
  if (position.before?.every((value, i) => value === next.board[i])) throw new Error('Ко: сначала сыграй в другом месте.');
  return next;
}

export function isLegal(position, point) {
  try {
    play(position, point);
    return true;
  } catch {
    return false;
  }
}

/** Every move from the start, passes included: black moves first, or white after handicap stones. */
export function replay(size, moves, stones = []) {
  return moves.reduce(play, startPosition(size, stones));
}
