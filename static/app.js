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
let delayNode, reverbNode, reverbWet, reverbDry, delayWetGain, delayDryGain;
let audioBuffer;

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audio.src = url;

  audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  sourceNode = audioContext.createMediaElementSource(audio);

  // === Core Nodes ===
  gainNode = audioContext.createGain();
  distortionNode = createDistortionCurve(400);

  dryGain = audioContext.createGain();
  wetGain = audioContext.createGain();

  // === Delay ===
  delayNode = audioContext.createDelay(5.0); // up to 5s delay
  delayNode.delayTime.value = 0.0;

  // === Reverb ===
  reverbNode = audioContext.createConvolver();
  reverbNode.buffer = buildImpulseResponse(audioContext, 2.5); // 2.5s IR
  reverbWet = audioContext.createGain();
  reverbDry = audioContext.createGain();
  reverbWet.gain.value = 0.0;
  reverbDry.gain.value = 1.0;

  // === Routing ===
  sourceNode.connect(gainNode);

  // Parallel distortion
  gainNode.connect(dryGain).connect(audioContext.destination);
  gainNode.connect(distortionNode).connect(wetGain).connect(audioContext.destination);

  // Add delay on main path
  gainNode.connect(delayNode).connect(audioContext.destination);

  // Reverb with wet/dry
  gainNode.connect(reverbDry).connect(audioContext.destination);
  gainNode.connect(reverbNode).connect(reverbWet).connect(audioContext.destination);
});

// === Controls ===
gainSlider.addEventListener("input", () => {
  let db = parseInt(gainSlider.value, 10);
  gainValue.textContent = `${db} dB`;
  if (gainNode) gainNode.gain.value = Math.pow(10, db / 20);
});

distSlider.addEventListener("input", () => {
  let mix = parseInt(distSlider.value, 10) / 100.0;
  distValue.textContent = `${distSlider.value}%`;
  if (dryGain && wetGain) {
    dryGain.gain.value = 1 - mix;
    wetGain.gain.value = mix;
  }
});

delaySlider.addEventListener("input", () => {
  let ms = parseInt(delaySlider.value, 10);
  delayValue.textContent = `${ms} ms`;
  if (delayNode) delayNode.delayTime.value = ms / 1000.0;
});

reverbSlider.addEventListener("input", () => {
  let mix = parseInt(reverbSlider.value, 10) / 100.0;
  reverbValue.textContent = `${reverbSlider.value}%`;
  if (reverbWet && reverbDry) {
    reverbWet.gain.value = mix;
    reverbDry.gain.value = 1 - mix;
  }
});

// === Offline rendering for download ===
downloadBtn.addEventListener("click", async () => {
  if (!audioBuffer) return;

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  let bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;

  let offlineGain = offlineCtx.createGain();
  let db = parseInt(gainSlider.value, 10);
  offlineGain.gain.value = Math.pow(10, db / 20);

  let offlineDistortion = createDistortionCurve(400, offlineCtx);
  let offlineDryGain = offlineCtx.createGain();
  let offlineWetGain = offlineCtx.createGain();
  let distMix = parseInt(distSlider.value, 10) / 100.0;
  offlineDryGain.gain.value = 1 - distMix;
  offlineWetGain.gain.value = distMix;

  let offlineDelay = offlineCtx.createDelay(5.0);
  offlineDelay.delayTime.value = parseInt(delaySlider.value, 10) / 1000.0;

  let offlineReverb = offlineCtx.createConvolver();
  offlineReverb.buffer = buildImpulseResponse(offlineCtx, 2.5);
  let offlineReverbWet = offlineCtx.createGain();
  let offlineReverbDry = offlineCtx.createGain();
  let revMix = parseInt(reverbSlider.value, 10) / 100.0;
  offlineReverbWet.gain.value = revMix;
  offlineReverbDry.gain.value = 1 - revMix;

  // === Offline Routing ===
  bufferSource.connect(offlineGain);

  // Distortion parallel
  offlineGain.connect(offlineDryGain).connect(offlineCtx.destination);
  offlineGain.connect(offlineDistortion).connect(offlineWetGain).connect(offlineCtx.destination);

  // Delay
  offlineGain.connect(offlineDelay).connect(offlineCtx.destination);

  // Reverb parallel
  offlineGain.connect(offlineReverbDry).connect(offlineCtx.destination);
  offlineGain.connect(offlineReverb).connect(offlineReverbWet).connect(offlineCtx.destination);

  bufferSource.start();

  const renderedBuffer = await offlineCtx.startRendering();

  let wavBlob = bufferToWav(renderedBuffer);
  let url = URL.createObjectURL(wavBlob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "processed.wav";
  a.click();
});

// === Helpers ===
function createDistortionCurve(amount, ctx = audioContext) {
  let distortion = ctx.createWaveShaper();
  let n_samples = 44100;
  let curve = new Float32Array(n_samples);
  let deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    let x = (i * 2) / n_samples - 1;
    curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
  }
  distortion.curve = curve;
  distortion.oversample = "4x";
  return distortion;
}

function buildImpulseResponse(ctx, duration = 2.0) {
  let rate = ctx.sampleRate;
  let length = rate * duration;
  let impulse = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    let channel = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2); // decaying noise
    }
  }
  return impulse;
}


function bufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels,
      length = buffer.length * numOfChan * 2 + 44, // 16-bit samples + WAV header
      buffer2 = new ArrayBuffer(length),
      view = new DataView(buffer2),
      channels = [],
      i, sample,
      offset = 0,
      pos = 0;

  // --- Write WAV file header ---
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);         // PCM header size = 16
  setUint16(1);          // format = PCM
  setUint16(numOfChan);  // number of channels
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16);         // bits per sample

  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  // --- Write interleaved PCM samples ---
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp [-1,1]
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // scale to 16-bit
      view.setInt16(pos, sample, true); // little endian
      pos += 2;
    }
    offset++;
  }

  // return a Blob that can be downloaded
  return new Blob([buffer2], { type: "audio/wav" });

  // --- Helper functions to write little endian ---
  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}

window.addEventListener("DOMContentLoaded", () => {
  // reset slider positions
  gainSlider.value = 0;
  distSlider.value = 0;
  delaySlider.value = 0;
  reverbSlider.value = 0;

  // reset displayed values
  gainValue.textContent = "0 dB";
  distValue.textContent = "0%";
  delayValue.textContent = "0 ms";
  reverbSlider.textContent = "0%";

  // Reset file input & audio
  fileInput.value = "";  // clears the selected file
  audio.src = "";        // removes any loaded audio
  audioBuffer = null;    // clear the decoded buffer
});