let audio = document.getElementById("audio");
let fileInput = document.getElementById("fileInput");
let gainSlider = document.getElementById("gainSlider");
let gainValue = document.getElementById("gainValue");
let distSlider = document.getElementById("distSlider");
let distValue = document.getElementById("distValue");
let downloadBtn = document.getElementById("downloadBtn");

let audioContext, sourceNode, gainNode, distortionNode, dryGain, wetGain, audioBuffer;

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audio.src = url;

  // Setup Web Audio
  audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  sourceNode = audioContext.createMediaElementSource(audio);

  // Create gain and distortion nodes
  gainNode = audioContext.createGain();
  distortionNode = createDistortionCurve(400); // amount fixed, mix controlled separately

  dryGain = audioContext.createGain();
  wetGain = audioContext.createGain();

  // Routing: source → gainNode → [dry, distortion] → mix → destination
  sourceNode.connect(gainNode);

  gainNode.connect(dryGain).connect(audioContext.destination);
  gainNode.connect(distortionNode).connect(wetGain).connect(audioContext.destination);
});

// Update gain in real-time
gainSlider.addEventListener("input", () => {
  let db = parseInt(gainSlider.value, 10);
  gainValue.textContent = `${db} dB`;
  if (gainNode) {
    gainNode.gain.value = Math.pow(10, db / 20); // convert dB → linear gain
  }
});

// Update distortion mix
distSlider.addEventListener("input", () => {
  let mix = parseInt(distSlider.value, 10) / 100.0;
  distValue.textContent = `${distSlider.value}%`;

  if (dryGain && wetGain) {
    dryGain.gain.value = 1 - mix;
    wetGain.gain.value = mix;
  }
});

// Download processed audio
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

  let mix = parseInt(distSlider.value, 10) / 100.0;
  offlineDryGain.gain.value = 1 - mix;
  offlineWetGain.gain.value = mix;

  // Routing in offline context
  bufferSource.connect(offlineGain);

  offlineGain.connect(offlineDryGain).connect(offlineCtx.destination);
  offlineGain.connect(offlineDistortion).connect(offlineWetGain).connect(offlineCtx.destination);

  bufferSource.start();

  const renderedBuffer = await offlineCtx.startRendering();

  // Export WAV
  let wavBlob = bufferToWav(renderedBuffer);
  let url = URL.createObjectURL(wavBlob);
  
  let a = document.createElement("a");
  a.href = url;
  a.download = "processed.wav";
  a.click();
});

// Distortion helper
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
