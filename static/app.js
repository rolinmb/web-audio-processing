let audio = document.getElementById("audio");
let fileInput = document.getElementById("fileInput");
let gainSlider = document.getElementById("gainSlider");
let gainValue = document.getElementById("gainValue");
let distSlider = document.getElementById("distSlider");
let distValue = document.getElementById("distValue");
let delaySlider = document.getElementById("delaySlider");
let delayValue = document.getElementById("delayValue");
let delayVolSlider = document.getElementById("delayVolSlider");
let delayVolValue = document.getElementById("delayVolValue");
let reverbSlider = document.getElementById("reverbSlider");
let reverbValue = document.getElementById("reverbValue");
let downloadBtn = document.getElementById("downloadBtn");

let audioContext, sourceNode, gainNode;
let distortionNode, dryGain, wetGain;
let delayNode, delayWetGain, delayDryGain;
let reverbNode, reverbWet, reverbDry;
let audioBuffer;

// --- Load file and setup audio nodes ---
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audio.src = url;

  audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  sourceNode = audioContext.createMediaElementSource(audio);

  // --- Core Nodes ---
  gainNode = audioContext.createGain();
  distortionNode = createDistortionCurve(400);

  dryGain = audioContext.createGain();
  wetGain = audioContext.createGain();

  // --- Delay Nodes ---
  delayNode = audioContext.createDelay(5.0);
  delayNode.delayTime.value = 0.0;

  delayDryGain = audioContext.createGain();
  delayWetGain = audioContext.createGain();
  delayDryGain.gain.value = 1.0;
  delayWetGain.gain.value = 0.0;

  // --- Reverb Nodes ---
  reverbNode = audioContext.createConvolver();
  reverbNode.buffer = buildImpulseResponse(audioContext, 2.5);

  reverbWet = audioContext.createGain();
  reverbDry = audioContext.createGain();
  reverbWet.gain.value = 0.0;
  reverbDry.gain.value = 1.0;

  // --- Routing ---
  sourceNode.connect(gainNode);

  // Parallel distortion
  gainNode.connect(dryGain).connect(audioContext.destination);
  gainNode.connect(distortionNode).connect(wetGain).connect(audioContext.destination);

  // Delay with wet/dry mix
  gainNode.connect(delayDryGain).connect(audioContext.destination);
  gainNode.connect(delayNode).connect(delayWetGain).connect(audioContext.destination);

  // Reverb with wet/dry
  gainNode.connect(reverbDry).connect(audioContext.destination);
  gainNode.connect(reverbNode).connect(reverbWet).connect(audioContext.destination);
});

// --- Slider Controls ---
gainSlider.addEventListener("input", () => {
  let db = parseInt(gainSlider.value, 10);
  gainValue.textContent = `${db} dB`;
  if (gainNode) gainNode.gain.value = Math.pow(10, db / 20);
});

distSlider.addEventListener("input", () => {
  let mix = parseInt(distSlider.value, 10) / 100;
  distValue.textContent = `${distSlider.value}%`;
  if (dryGain && wetGain) {
    dryGain.gain.value = 1 - mix;
    wetGain.gain.value = mix;
  }
});

delaySlider.addEventListener("input", () => {
  let ms = parseInt(delaySlider.value, 10);
  delayValue.textContent = `${ms} ms`;
  if (delayNode) delayNode.delayTime.value = ms / 1000;
});

delayVolSlider.addEventListener("input", () => {
  let mix = parseInt(delayVolSlider.value, 10) / 100;
  delayVolValue.textContent = `${delayVolSlider.value}%`;
  if (delayDryGain && delayWetGain) {
    delayDryGain.gain.value = 1 - mix;
    delayWetGain.gain.value = mix;
  }
});

reverbSlider.addEventListener("input", () => {
  let mix = parseInt(reverbSlider.value, 10) / 100;
  reverbValue.textContent = `${reverbSlider.value}%`;
  if (reverbDry && reverbWet) {
    reverbDry.gain.value = 1 - mix;
    reverbWet.gain.value = mix;
  }
});

// --- Offline Rendering ---
downloadBtn.addEventListener("click", async () => {
  if (!audioBuffer) return;

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;

  // Gain
  let offlineGain = offlineCtx.createGain();
  offlineGain.gain.value = Math.pow(10, parseInt(gainSlider.value, 10) / 20);

  // Distortion
  let offlineDist = createDistortionCurve(400, offlineCtx);
  let offlineDry = offlineCtx.createGain();
  let offlineWet = offlineCtx.createGain();
  let distMix = parseInt(distSlider.value, 10) / 100;
  offlineDry.gain.value = 1 - distMix;
  offlineWet.gain.value = distMix;

  // Delay
  let offlineDelay = offlineCtx.createDelay(5.0);
  offlineDelay.delayTime.value = parseInt(delaySlider.value, 10) / 1000;

  let offlineDelayDry = offlineCtx.createGain();
  let offlineDelayWet = offlineCtx.createGain();
  let delayMix = parseInt(delayVolSlider.value, 10) / 100;
  offlineDelayDry.gain.value = 1 - delayMix;
  offlineDelayWet.gain.value = delayMix;

  // Reverb
  let offlineReverb = offlineCtx.createConvolver();
  offlineReverb.buffer = buildImpulseResponse(offlineCtx, 2.5);

  let offlineReverbWet = offlineCtx.createGain();
  let offlineReverbDry = offlineCtx.createGain();
  let revMix = parseInt(reverbSlider.value, 10) / 100;
  offlineReverbDry.gain.value = 1 - revMix;
  offlineReverbWet.gain.value = revMix;

  // Routing
  bufferSource.connect(offlineGain);

  // Distortion
  offlineGain.connect(offlineDry).connect(offlineCtx.destination);
  offlineGain.connect(offlineDist).connect(offlineWet).connect(offlineCtx.destination);

  // Delay
  offlineGain.connect(offlineDelayDry).connect(offlineCtx.destination);
  offlineGain.connect(offlineDelay).connect(offlineDelayWet).connect(offlineCtx.destination);

  // Reverb
  offlineGain.connect(offlineReverbDry).connect(offlineCtx.destination);
  offlineGain.connect(offlineReverb).connect(offlineReverbWet).connect(offlineCtx.destination);

  bufferSource.start();
  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = bufferToWav(renderedBuffer);

  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "processed.wav";
  a.click();
});

// --- Helpers ---
function createDistortionCurve(amount, ctx = audioContext) {
  const distortion = ctx.createWaveShaper();
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; i++) {
    let x = (i * 2) / n_samples - 1;
    curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
  }
  distortion.curve = curve;
  distortion.oversample = "4x";
  return distortion;
}

function buildImpulseResponse(ctx, duration = 2.0) {
  const rate = ctx.sampleRate;
  const length = rate * duration;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    let channel = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }
  return impulse;
}

function bufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels;
  let length = buffer.length * numOfChan * 2 + 44;
  let buffer2 = new ArrayBuffer(length);
  let view = new DataView(buffer2);
  let channels = [];
  let pos = 0;
  let offset = 0;

  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952);
  setUint32(length - 8);
  setUint32(0x45564157);

  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164);
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer2], { type: "audio/wav" });
}

// --- Reset sliders & file on load ---
window.addEventListener("DOMContentLoaded", () => {
  gainSlider.value = 0; gainValue.textContent = "0 dB";
  distSlider.value = 0; distValue.textContent = "0%";
  delaySlider.value = 0; delayValue.textContent = "0 ms";
  delayVolSlider.value = 0; delayVolValue.textContent = "0%";
  reverbSlider.value = 0; reverbValue.textContent = "0%";
  fileInput.value = "";
  audio.src = "";
  audioBuffer = null;
});
