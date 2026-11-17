/** The sound of a stone on the board. */
import { stoneRecordings } from './recordings.mjs';

const recordingRate = 44100;
const stoneVolume = 0.8;
/** Takes the click off the top, so the stone lands duller, like on a thick board. */
const stoneMuffle = { type: 'highshelf', frequency: 2500, gain: -7 };

/** Samples of one take, from -1 to 1. */
export function takeSamples(text) {
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  return Float32Array.from(new Int16Array(bytes.buffer), (value) => value / 32768);
}

let audio = null;
let stoneBuffers = null;
/** WebKit keeps sound off until a click, so the first click opens it for the bot's moves too. */
export function wakeSound() {
  if (!window.AudioContext) return;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') audio.resume();
}
/** A random take, a little louder or softer, so the stones do not repeat each other. */
export function playStone() {
  wakeSound();
  if (!audio) return;
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
