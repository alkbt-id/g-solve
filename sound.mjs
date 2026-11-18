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
/**
 * WebKit keeps sound off until the player touches the page, so every touch opens it again.
 * Safari 'interrupts' sound when the phone locks, another app plays or a call comes, and such a sound
 * often stays mute after resume(): it is replaced by a new one, made inside the touch.
 */
export function wakeSound() {
  if (!window.AudioContext) return;
  if (audio && (audio.state === 'interrupted' || audio.state === 'closed')) {
    audio.close().catch(() => {});
    audio = null;
    stoneBuffers = null;
  }
  audio ??= new AudioContext();
  if (audio.state !== 'running') audio.resume().catch(() => {});
}
/** Opens sound on every kind of touch: a finger counts on release, a mouse and keys on press. */
export function listenForSound() {
  for (const type of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(type, wakeSound, true);
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
