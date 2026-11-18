/** The sound of a stone on the board. */
import { stoneRecordings } from './recordings.mjs';

const recordingRate = 44100;
const stoneVolume = 0.8;
/** Takes the click off the top, so the stone lands duller, like on a thick board. */
const stoneMuffle = { type: 'highshelf', frequency: 2500, gain: -7 };
/** A stone that could not sound by then is dropped: a late knock comes on the wrong move. */
const lateLimit = 250;

/** Samples of one take, from -1 to 1. */
export function takeSamples(text) {
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  return Float32Array.from(new Int16Array(bytes.buffer), (value) => value / 32768);
}

let audio = null;
let stoneBuffers = null;
/** Wall time and sound time at the last look: a sound whose clock stands still is dead. */
let lastLook = null;

function dropSound() {
  audio?.close().catch(() => {});
  audio = null;
  stoneBuffers = null;
  lastLook = null;
}
/**
 * A sound that says it runs may still be mute: Safari leaves it so after the page sleeps in the
 * background (most of all from the home screen), and a Mac after the speakers or headphones change.
 * Its clock then stands still, or it says 'interrupted'.
 */
function soundIsDead() {
  if (audio.state === 'interrupted' || audio.state === 'closed') return true;
  if (audio.state !== 'running' || !lastLook) return false;
  const wall = (performance.now() - lastLook.wall) / 1000;
  return wall > 0.2 && audio.currentTime - lastLook.sound < wall / 4;
}
/** WebKit keeps sound off until the player touches the page, so a dead sound is replaced inside a touch. */
export function wakeSound() {
  if (!window.AudioContext) return;
  if (audio && soundIsDead()) dropSound();
  audio ??= new AudioContext();
  if (audio.state !== 'running') audio.resume().catch(() => {});
  lastLook = { wall: performance.now(), sound: audio.currentTime };
}
/**
 * Opens sound on every kind of touch: a finger counts on release, a mouse and keys on press.
 * A page back from the background, or new speakers, get a new sound on the next touch.
 */
export function listenForSound() {
  for (const type of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(type, wakeSound, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') dropSound();
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', dropSound);
}

function strike() {
  stoneBuffers ??= stoneRecordings.katrain.map((text) => {
    const samples = takeSamples(text);
    const buffer = audio.createBuffer(1, samples.length, recordingRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  });
  const source = new AudioBufferSourceNode(audio, { buffer: stoneBuffers[Math.floor(Math.random() * stoneBuffers.length)] });
  const gain = new GainNode(audio, { gain: stoneVolume * (0.85 + Math.random() * 0.15) });
  source.connect(new BiquadFilterNode(audio, stoneMuffle)).connect(gain).connect(audio.destination);
  source.start();
}
/**
 * A random take, a little louder or softer, so the stones do not repeat each other.
 * A stone started on a sleeping sound would wait and knock later, all at once with the others,
 * so it starts only once the sound is running, and is dropped if that takes too long.
 */
export function playStone() {
  wakeSound();
  if (!audio) return;
  if (audio.state === 'running') return strike();
  const asked = performance.now();
  const context = audio;
  context.resume().then(() => {
    if (audio === context && context.state === 'running' && performance.now() - asked < lateLimit) strike();
  }, () => {});
}
