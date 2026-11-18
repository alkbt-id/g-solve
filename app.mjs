/** One screen: your rank, a problem of that difficulty, then right or wrong and the rank after it. */
import { play, isLegal } from './rules.mjs';
import { answer, nextKyu, pairOf, pickEasier, pickProblem, playLine, problemPosition, rankText, size, solutionLine, startKyu, strongestKyu, viewOf, weakestKyu } from './problems.mjs';
import { loadCollections, loadState, saveCollection, saveState } from './store.mjs';
import { listenForSound, playStone, setSoundOn, soundOn } from './sound.mjs';

const historyLimit = 5000;
const replyPause = 350;
const version = document.querySelector('meta[name="read-version"]')?.content ?? '';
const root = document.getElementById('app');

/** Every problem the page knows: those of the collections loaded from files. */
let problems = [];
let byId = new Map();
let state = { version: 1, kyu: startKyu, seen: {}, current: null, history: [] };
/** The opponent's reply is on its way. */
let busy = false;
let note = '';
let ghost = null;
let showSolution = false;
/** How many moves of the solution are on the board while it is shown. */
let solutionStep = 0;

function validState(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  if (!Number.isFinite(value.kyu) || value.kyu > weakestKyu || value.kyu < strongestKyu) return null;
  const current = value.current && byId.has(value.current.id) && Array.isArray(value.current.moves) ? value.current : null;
  return { ...value, seen: value.seen && typeof value.seen === 'object' ? value.seen : {}, current, history: Array.isArray(value.history) ? value.history : [] };
}
function save() {
  const error = saveState(state);
  if (error) note = `Не сохранено: ${error}`;
}

/* The problem */
const problemOf = () => byId.get(state.current.id);
/** The position now and the tree you go on from, walking your moves and the replies. */
function walk() {
  const problem = problemOf();
  let tree = problem.tree;
  const position = playLine(problemPosition(problem), state.current.moves);
  const { moves } = state.current;
  for (let i = 0; i < moves.length && tree; i += 2) {
    const step = answer(tree, moves[i]);
    tree = step.verdict === 'on' ? step.tree : null;
  }
  return { position, tree };
}
const yourTurn = () => state.current?.status === 'playing' && !busy;

function nextProblem() {
  const problem = pickProblem(problems, state.kyu + pickEasier, state.seen);
  showSolution = false;
  note = '';
  state.current = problem ? { id: problem.id, kyu: state.kyu, moves: [], status: 'playing', started: Date.now() } : null;
  save();
  render();
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function userMove(point) {
  if (!yourTurn()) return;
  const { position, tree } = walk();
  try { play(position, point); } catch (error) {
    note = error.message;
    render();
    return;
  }
  note = '';
  ghost = null;
  const { current } = state;
  current.moves.push(point);
  playStone();
  const step = answer(tree, point);
  if (step.reply !== null) {
    busy = true;
    render();
    await pause(replyPause);
    busy = false;
    if (state.current !== current) return;
    current.moves.push(step.reply);
    playStone();
  }
  if (step.verdict === 'on') {
    save();
    render();
    return;
  }
  finish(step.verdict === 'solved');
}
function finish(solved) {
  const { current } = state;
  const problem = problemOf();
  current.status = solved ? 'solved' : 'failed';
  current.kyuAfter = nextKyu(current.kyu, problem.rank, solved, state.history.length);
  state.kyu = current.kyuAfter;
  state.seen[current.id] = Date.now();
  state.history.push({
    date: new Date().toISOString(),
    id: current.id,
    rank: problem.rank,
    kyu: current.kyu,
    kyuAfter: current.kyuAfter,
    solved,
    moves: current.moves.map(pairOf).join(' '),
    seconds: current.started ? Math.round((Date.now() - current.started) / 1000) : null,
  });
  if (state.history.length > historyLimit) state.history.splice(0, state.history.length - historyLimit);
  save();
  render();
}

/* The board: the part of 19 × 19 the problem stands on */
const svgSpace = 'http://www.w3.org/2000/svg';
const cell = 64;
const edge = cell * 0.7;
const stoneRadius = cell * 0.47;
const stars = [3, 9, 15];
const inks = { 1: '#0e0f11', 2: '#f7f6f1' };

function svgNode(tag, attributes = {}, text = null) {
  const node = document.createElementNS(svgSpace, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== null) node.textContent = text;
  return node;
}
function geometry(view) {
  const columns = view.right - view.left + 1;
  const rows = view.bottom - view.top + 1;
  const x = (column) => edge + (column - view.left) * cell;
  const y = (row) => edge + (row - view.top) * cell;
  return { width: edge * 2 + cell * (columns - 1), height: edge * 2 + cell * (rows - 1), x, y };
}
function stoneNode(at, point, color, opacity = 1) {
  const cx = at.x(point % size);
  const cy = at.y(Math.floor(point / size));
  const group = svgNode('g', { opacity });
  group.append(svgNode('circle', { cx: cx + 1, cy: cy + 2.5, r: stoneRadius, fill: '#28190a', opacity: 0.35 }));
  group.append(svgNode('circle', { cx, cy, r: stoneRadius, fill: `url(#stone-${color})` }));
  return group;
}
function drawBoard(svg, view, shown, { numbers = null, toPlay } = {}) {
  const at = geometry(view);
  svg.replaceChildren();
  const defs = svgNode('defs');
  for (const [color, stops] of [[1, [['0%', '#5b5e63'], ['55%', '#1c1d20'], ['100%', '#0e0f11']]], [2, [['0%', '#ffffff'], ['60%', '#efede6'], ['100%', '#c8c5ba']]]]) {
    const gradient = svgNode('radialGradient', { id: `stone-${color}`, cx: '36%', cy: '30%', r: '75%' });
    for (const [offset, ink] of stops) gradient.append(svgNode('stop', { offset, 'stop-color': ink }));
    defs.append(gradient);
  }
  svg.append(defs, svgNode('rect', { width: at.width, height: at.height, rx: 10, fill: '#ddb56c' }));
  // Lines run out to the frame where the board goes on, and stop at the board's edge.
  const fromX = view.left === 0 ? at.x(0) : 0;
  const toX = view.right === size - 1 ? at.x(size - 1) : at.width;
  const fromY = view.top === 0 ? at.y(0) : 0;
  const toY = view.bottom === size - 1 ? at.y(size - 1) : at.height;
  let lines = '';
  for (let row = view.top; row <= view.bottom; row++) lines += `M${fromX} ${at.y(row)}H${toX}`;
  for (let column = view.left; column <= view.right; column++) lines += `M${at.x(column)} ${fromY}V${toY}`;
  svg.append(svgNode('path', { d: lines, stroke: '#6e5228', 'stroke-width': 1.4, fill: 'none' }));
  for (const row of stars) {
    for (const column of stars) {
      if (row < view.top || row > view.bottom || column < view.left || column > view.right) continue;
      svg.append(svgNode('circle', { cx: at.x(column), cy: at.y(row), r: 4.5, fill: '#5a4320' }));
    }
  }
  shown.board.forEach((color, point) => {
    if (color) svg.append(stoneNode(at, point, color));
  });
  if (ghost !== null) svg.append(stoneNode(at, ghost, toPlay, 0.5));
  if (numbers) {
    for (const [point, number] of numbers) {
      if (!shown.board[point]) continue;
      svg.append(svgNode('text', { x: at.x(point % size), y: at.y(Math.floor(point / size)), fill: inks[3 - shown.board[point]], 'font-size': 26, 'font-weight': 600, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': '-apple-system, sans-serif' }, String(number)));
    }
  } else if (shown.last !== null && shown.board[shown.last]) {
    const point = shown.last;
    svg.append(svgNode('circle', { cx: at.x(point % size), cy: at.y(Math.floor(point / size)), r: stoneRadius * 0.55, fill: 'none', stroke: inks[3 - shown.board[point]], 'stroke-width': 3 }));
  }
}
/** A finger aims this far above itself, so it does not cover the stone it carries. */
const fingerLift = cell * 0.75;
function pointAt(svg, view, event) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  const lift = event.pointerType === 'touch' ? fingerLift : 0;
  const column = view.left + Math.round((local.x - edge) / cell);
  const row = view.top + Math.round((local.y - lift - edge) / cell);
  if (column < view.left || column > view.right || row < view.top || row > view.bottom) return null;
  return row * size + column;
}
function boardView() {
  const problem = problemOf();
  const view = viewOf(problem);
  const at = geometry(view);
  const svg = svgNode('svg', { id: 'board', viewBox: `0 0 ${at.width} ${at.height}`, role: 'img', 'aria-label': 'Задача' });
  let shown;
  let options = {};
  if (showSolution) {
    // One move at a time, so captures are seen as they happen; a point played twice shows its last number.
    const line = solutionLine(problem.tree).slice(0, solutionStep);
    shown = playLine(problemPosition(problem), line);
    options = { numbers: new Map(line.map((point, index) => [point, index + 1])) };
  } else {
    shown = walk().position;
    options = { toPlay: shown.toPlay };
  }
  const active = yourTurn() && !showSolution;
  svg.classList.toggle('active', active);
  drawBoard(svg, view, shown, options);
  // While the solution is shown a tap on the board plays its next move.
  if (showSolution) svg.addEventListener('click', () => stepSolution(1));
  if (active) {
    // A mouse shows the ghost stone on hover. A finger shows it while pressed, three quarters of a point
    // above itself, and drags it about; the stone lands where the ghost is when the finger lifts.
    let pressed = false;
    const showGhost = (event) => {
      const point = pointAt(svg, view, event);
      const next = point !== null && isLegal(shown, point) ? point : null;
      if (next === ghost) return;
      ghost = next;
      drawBoard(svg, view, shown, options);
    };
    svg.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      pressed = true;
      try { svg.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
      showGhost(event);
    });
    svg.addEventListener('pointermove', (event) => {
      if (pressed || event.pointerType === 'mouse') showGhost(event);
    });
    svg.addEventListener('pointerup', (event) => {
      if (!pressed) return;
      pressed = false;
      const point = pointAt(svg, view, event);
      if (point !== null) userMove(point);
      else if (ghost !== null) {
        ghost = null;
        drawBoard(svg, view, shown, options);
      }
    });
    const drop = () => {
      pressed = false;
      if (ghost === null) return;
      ghost = null;
      drawBoard(svg, view, shown, options);
    };
    svg.addEventListener('pointercancel', drop);
    svg.addEventListener('pointerleave', (event) => {
      if (!pressed && event.pointerType === 'mouse') drop();
    });
  }
  const area = el('div', 'board-area');
  area.append(svg);
  return area;
}

/* The panel */
function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
function button(label, className, action, disabled = false) {
  const node = el('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', action);
  return node;
}
const sideName = { B: 'Чёрные', W: 'Белые' };
const goalText = { live: ' и живут', kill: ' и убивают' };
function taskText(problem) {
  return `${sideName[problem.play]} начинают${goalText[problem.goal] ?? ''}`;
}
function resultBlock() {
  const { current } = state;
  const solved = current.status === 'solved';
  const block = el('section', 'result');
  block.append(el('p', `verdict ${solved ? 'won' : 'lost'}`, solved ? 'Верно' : 'Ошибка'));
  const moved = rankText(current.kyuAfter) !== rankText(current.kyu);
  // Up is stronger: fewer kyu.
  const change = Math.round((current.kyu - current.kyuAfter) * 10) / 10;
  const changeText = change ? ` (${change > 0 ? '+' : '−'}${Math.abs(change).toLocaleString('ru-RU')})` : '';
  block.append(el('p', 'rank-change', moved ? `Ранг: ${rankText(current.kyu)} → ${rankText(current.kyuAfter)}${changeText}` : `Ранг ${rankText(current.kyuAfter)}${changeText}`));
  return block;
}
function toggleSolution() {
  showSolution = !showSolution;
  solutionStep = 0;
  render();
}
function stepSolution(by) {
  const length = solutionLine(problemOf().tree).length;
  const next = Math.max(0, Math.min(length, solutionStep + by));
  if (next === solutionStep) return;
  solutionStep = next;
  if (by > 0) playStone();
  render();
}
/** Back, the move count, forward. */
function solutionSteps() {
  const length = solutionLine(problemOf().tree).length;
  const row = el('div', 'steps');
  row.append(button('‹', 'outline step', () => stepSolution(-1), solutionStep === 0),
    el('span', 'step-count', solutionStep === 0 ? `Решение: ${length} ${movesWord(length)}` : `Ход ${solutionStep} из ${length}`),
    button('›', 'outline step', () => stepSolution(1), solutionStep === length));
  return row;
}
const movesWord = (count) => (count % 10 === 1 && count % 100 !== 11 ? 'ход' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'хода' : 'ходов');

function sidePanel() {
  const side = el('aside', 'side');
  const rank = el('div', 'rank');
  rank.append(el('span', 'rank-label', 'Твой ранг'), el('span', 'rank-value', rankText(state.kyu)));
  side.append(rank);
  const { current } = state;
  if (!current) {
    side.append(el('p', 'muted', problems.length ? 'Задачи на счёт: найди ход и доведи решение до конца. Ранг считается как рейтинг: решил задачу, которую от тебя не ждали, — он растёт сильнее, ошибся в лёгкой — сильнее падает.' : 'Задач пока нет. Загрузи сборник, собранный на Mac: «Загрузить сборник» внизу, файл в iCloud Drive → G Read.'));
    if (problems.length) side.append(button('Начать', 'primary', nextProblem));
  } else {
    const problem = problemOf();
    const task = el('div', 'task');
    task.append(el('span', `stone-mark ${problem.play === 'B' ? 'black' : 'white'}`), el('span', 'task-text', taskText(problem)));
    side.append(task);
    if (current.status === 'playing') {
      side.append(el('p', 'status', busy ? 'Ответ…' : 'Твой ход'));
    } else {
      side.append(resultBlock());
      const actions = el('div', 'actions');
      if (showSolution) side.append(solutionSteps());
      if (current.status === 'failed') actions.append(button(showSolution ? 'Скрыть' : 'Решение', 'outline', toggleSolution));
      actions.append(button('Дальше', 'primary', nextProblem));
      side.append(actions);
    }
  }
  if (note) side.append(el('p', 'note', note));
  side.append(collectionsBlock());
  return side;
}
function collectionsBlock() {
  const block = el('div', 'footer muted');
  const picker = el('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.hidden = true;
  picker.addEventListener('change', () => importFile(picker.files?.[0]));
  block.append(el('span', '', `Задач: ${problems.length}${version ? ` · версия ${version}` : ''}`), button('Загрузить сборник', 'link', () => picker.click()), picker);
  if (state.history.length) block.append(button('Выгрузить историю', 'link', exportHistory));
  block.append(button(soundOn() ? 'Выключить звук' : 'Включить звук', 'link', toggleSound));
  return block;
}

/**
 * The solved and missed problems as a file, for checking the difficulty scale on the Mac. On the iPhone
 * the share sheet saves it («Сохранить в Файлы»); elsewhere it downloads.
 */
async function exportHistory() {
  const day = new Date().toISOString().slice(0, 10);
  const file = new File([JSON.stringify({ exported: new Date().toISOString(), kyu: state.kyu, history: state.history })], `g-read-history-${day}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

/** A collection file made on the Mac: { name, problems }. It replaces a loaded one of the same name. */
async function importFile(file) {
  if (!file) return;
  try {
    const collection = JSON.parse(await file.text());
    if (typeof collection?.name !== 'string' || !Array.isArray(collection.problems) || !collection.problems.length) throw new Error('это не сборник задач');
    for (const problem of collection.problems) {
      if (typeof problem.id !== 'string' || typeof problem.tree !== 'object' || !['B', 'W'].includes(problem.play)) throw new Error(`задача ${problem.id ?? '?'} не читается`);
    }
    await saveCollection(collection);
    await loadProblems();
    note = `Сборник «${collection.name}» загружен: ${collection.problems.length} задач.`;
  } catch (error) {
    // Safari cannot read a file iCloud has not finished downloading to the phone, or has just replaced.
    const notHere = error.name === 'NotFoundError' || error.name === 'NotReadableError';
    note = notHere
      ? 'Сборник не загружен: файл ещё не скачан из iCloud. Открой его в «Файлах» (iCloud Drive → G Read), дождись, пока он скачается, и выбери снова.'
      : `Сборник не загружен: ${error.message}`;
  }
  render();
}
function toggleSound() {
  setSoundOn(!soundOn());
  render();
}

function render() {
  root.classList.toggle('over', Boolean(state.current && state.current.status !== 'playing'));
  root.replaceChildren(...(state.current ? [boardView()] : [el('div', 'board-area')]), sidePanel());
}

async function loadProblems() {
  // The page has no problems of its own: they come from collections loaded from files.
  const collections = await loadCollections();
  problems = collections.flatMap((collection) => collection.problems);
  byId = new Map(problems.map((problem) => [problem.id, problem]));
}

async function start() {
  await loadProblems();
  const loaded = loadState();
  state = validState(loaded) ?? state;
  if (loaded && !validState(loaded)) note = 'Сохранение не прочитано, начато заново.';
  listenForSound();
  render();
}
start();
