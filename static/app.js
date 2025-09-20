let audio = document.getElementById("audio");
let fileInput = document.getElementById("fileInput");
let gainSlider = document.getElementById("gainSlider");
let gainValue = document.getElementById("gainValue");
let downloadBtn = document.getElementById("downloadBtn");

let audioContext, sourceNode, gainNode, audioBuffer;

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
  gainNode = audioContext.createGain();

  sourceNode.connect(gainNode).connect(audioContext.destination);
});

// Update gain in real-time
gainSlider.addEventListener("input", () => {
  let db = parseInt(gainSlider.value, 10);
  gainValue.textContent = `${db} dB`;
  if (gainNode) {
    gainNode.gain.value = Math.pow(10, db / 20); // convert dB → linear gain
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

  bufferSource.connect(offlineGain).connect(offlineCtx.destination);
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

// Helper: convert AudioBuffer → WAV Blob
function bufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels,
      length = buffer.length * numOfChan * 2 + 44,
      buffer2 = new ArrayBuffer(length),
      view = new DataView(buffer2),
      channels = [],
      i, sample,
      offset = 0,
      pos = 0;

  // write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4);

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer2], { type: "audio/wav" });

  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}
