// Windows 3.1 system palette: https://www.compuphase.com/palette.htm
const SYSTEM_COLORS_LOWER = [
  0, 0, 0, 0,
  128, 0, 0, 255,
  0, 128, 0, 255,
  128, 128, 0, 255,
  0, 0, 128, 255,
  128, 0, 128, 255,
  0, 128, 128, 255,
  192, 192, 192, 255,
  192, 220, 192, 255,
  166, 202, 240, 255,
];
const SYSTEM_COLORS_UPPER = [
  255, 251, 240, 255,
  160, 160, 164, 255,
  128, 128, 128, 255,
  255, 0, 0, 255,
  0, 255, 0, 255,
  255, 255, 0, 255,
  0, 0, 255, 255,
  255, 0, 255, 255,
  0, 255, 255, 255,
  255, 255, 255, 255,
];

// Resource Types
const RS_TYPE_RLSY = 0x3EC;
const RS_TYPE_SND = 0x3EE;
const RS_TYPE_CLUT = 0x3EF;
const RS_TYPE_PICT = 0x3F3;

// Voice Banks (Yobi)
const YOBI_ANIMATION_RESOURCES = [
  25719,
  25971,
  26224,
  26483,
  26729,
  27764,
  28014,
  28019,
  28263,
  28514,
  28782,  // TODO: This is Crackers' voice bank, but applying it to Yobi is funny
  28786,
  29288,
  29299,
  29539,
  29550,  // TODO: Yobi's staff
  29552,
  29556,
  31086,
];

const audioContext = new AudioContext();
const audioGain = audioContext.createGain();
var voiceLines = new Map();
var voiceBanks = [];
var activeVoiceId = -1;
var activeSoundSource;
var activeSoundStartTime;
var clut = new Uint8ClampedArray(0x400);
var yobiBitmap;

// {Resource Type ID (int) -> {Resource ID (int) -> DllResource}}
var dllResourceMap = new Map();
var dllBytes;

function showStatus(message) {
  if (message) {
    document.getElementById('statusContainer').style.display = 'block';
    document.getElementById('statusText').innerHTML = message;
  } else {
    document.getElementById('statusContainer').style.display = 'none';
    document.getElementById('statusText').innerHTML = '';
  }
}

class DllResource {
  constructor(typeId) {
    this.typeId = typeId;
    this.startOffset = 0;
    this.byteLength = 0;
    this.resourceId = -1;
  }

  parse(bytes, offset, align) {
    this.startOffset = bytes.getUint16(offset, true) * align;
    this.byteLength = bytes.getUint16(offset + 0x02, true) * align;
    this.resourceId = bytes.getUint16(offset + 0x06, true) & 0x7FFF;
    this.bytes = new DataView(bytes.buffer, this.startOffset, this.byteLength);
    return offset + 0x0C;
  }
}

function getResource(typeId, resourceId) {
  let resourceIdMap = dllResourceMap.get(typeId);
  if (!resourceIdMap) return;
  return resourceIdMap.get(resourceId);
}

function parseBitmapResource(resourceId) {
  var resource = getResource(RS_TYPE_PICT, resourceId);
  if (!resource) {
    console.error(`Bitmap resource not found: ${resourceId}`)
    return; 
  }

  width = resource.bytes.getUint16(0x06, true);
  height = resource.bytes.getUint16(0x04, true);
  let pixelArray = new Uint8ClampedArray(4 * width * height);
  let src = 0x08;
  let dst = 0;
  while (src < resource.byteLength && dst < pixelArray.length) {
    let ctrl = resource.bytes.getInt8(src++);
    if (ctrl < 0) {
      let index = resource.bytes.getUint8(src++);
      ctrl = 1 - ctrl;
      while (--ctrl >= 0) {
        pixelArray[dst + 0] = clut[index * 4 + 0];
        pixelArray[dst + 1] = clut[index * 4 + 1];
        pixelArray[dst + 2] = clut[index * 4 + 2];
        pixelArray[dst + 3] = clut[index * 4 + 3];
        dst += 4;
      }
    } else {
      ctrl++;
      while (--ctrl >= 0) {
        let index = resource.bytes.getUint8(src++);
        pixelArray[dst + 0] = clut[index * 4 + 0];
        pixelArray[dst + 1] = clut[index * 4 + 1];
        pixelArray[dst + 2] = clut[index * 4 + 2];
        pixelArray[dst + 3] = clut[index * 4 + 3];
        dst += 4;
      }
    }
  }
  return new ImageData(pixelArray, width, height);
}

class TiledBitmap {
  constructor(resourceId, tileHeight) {
    let imageData = parseBitmapResource(resourceId)
    this.tileWidth = imageData.width
    this.tileHeight = tileHeight;
    this.tileCount = Math.floor(imageData.height / tileHeight);
    createImageBitmap(imageData).then((result) => {
      this.imageBitmap = result;
    });
  }

  draw(x, y, index, ctx) {
    if (!this.imageBitmap) return;
    ctx.drawImage(this.imageBitmap, 0, this.tileHeight * index, this.tileWidth, this.tileHeight, x, y, this.tileWidth, this.tileHeight);
  }
}

class VoiceLine {
  constructor(id, keyframes) {
    this.id = id;
    this.keyframes = keyframes;
    this.buildBuffer();
  }

  buildBuffer() {
    if (this.id == 0xFFFF) {
      return;
    }
    const sndResource = getResource(RS_TYPE_SND, this.id);
    const magic = sndResource.bytes.getUint32(0x00, true);
    if (magic != 0x575342) {  // BSW\0
      showStatus(`Error: Invalid BSW magic at offset 0 for sound ${this.id}`);
      return;
    }
    const sampleRate = sndResource.bytes.getUint16(0x08, true);
    const numSamples = sndResource.bytes.getUint32(0x0A, true);
    // console.log(`BSW: Sample rate = ${sampleRate}, num samples = ${numSamples}`);

    this.soundBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
    const channelData = this.soundBuffer.getChannelData(0);
    for (let i = 0; i < channelData.length; ++i) {
      channelData[i] = (sndResource.bytes.getUint8(i + 0x10) / 128) - 1;
    }
    return true;
  }
}

function playVoice(voiceId) {
  if (!voiceId) return;
  voiceLine = voiceLines.get(voiceId);
  activeVoiceId = voiceId;

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  if (activeSoundSource) {
    activeSoundSource.stop();
  }
  let soundSource = audioContext.createBufferSource();
  soundSource.buffer = voiceLine.soundBuffer;
  soundSource.connect(audioGain).connect(audioContext.destination);
  soundSource.start();
  activeSoundSource = soundSource;
  activeSoundStartTime = audioContext.currentTime;
}

function selectVoiceBank(index) {
  if (index < 0 || index >= voiceBanks.length) return;
  bank = voiceBanks[index]

  const voiceSelect = document.getElementById('voiceSelect');
  voiceSelect.length = 0;
  for (let i = 0; i < bank.length; ++i) {
    let option = document.createElement('option');
    option.value = bank[i];
    option.innerHTML = `${bank[i]}`;
    voiceSelect.appendChild(option);
  }
}

function buildVoiceBanks() {
  const bankSelect = document.getElementById('bankSelect');

  for (let i = 0; i < YOBI_ANIMATION_RESOURCES.length; ++i) {
    bankResource = getResource(RS_TYPE_RLSY, YOBI_ANIMATION_RESOURCES[i]);
    bank = []
    const count = bankResource.bytes.getUint16(0x00, true);
    let offset = 0x02;
    for (let i = 0; i < count; ++i) {
      const voiceId = bankResource.bytes.getUint16(offset, true);
      const kfPairCount = bankResource.bytes.getUint16(offset + 0x04, true);
      if (voiceId == 0xFFFF) {
        offset += kfPairCount * 0x04 + 0x06;
        continue;
      }
      let keyframes = [];
      offset += 0x06;
      for (let j = 0; j < kfPairCount; ++j) {
        const kfCount = bankResource.bytes.getUint16(offset + j * 0x04 + 0x02, true);
        for (let k = 0; k < kfCount; ++k) {
          keyframes.push(bankResource.bytes.getUint16(offset + j * 0x04, true));
        }
      }
      offset += kfPairCount * 0x04;

      bank.push(voiceId);
      const voiceLine = new VoiceLine(voiceId, keyframes);
      voiceLines.set(voiceId, voiceLine);
    }
    voiceBanks.push(bank);

    let option = document.createElement('option');
    option.value = i;
    option.innerHTML = `Bank ${YOBI_ANIMATION_RESOURCES[i]}`;
    bankSelect.appendChild(option);
  }

  // Select the first bank in the list
  selectVoiceBank(0);

  return true;
}

function buildClut() {
  var clutResource = getResource(RS_TYPE_CLUT, 1049);
  if (!clutResource) {
    showStatus('Error: CLUT resource not found');
    return false;
  }
  if (clutResource.bytes.getUint16(0x04, true) != 0x3E7) {
    showStatus('Error: Unexpected value at offset 0x04 in CLUT resource');
    return false;
  }
  for (let i = 10; i < 246; ++i) {
    clut[i * 4 + 0] = clutResource.bytes.getUint8((i - 10) * 0x08 + 0x1A);
    clut[i * 4 + 1] = clutResource.bytes.getUint8((i - 10) * 0x08 + 0x1C);
    clut[i * 4 + 2] = clutResource.bytes.getUint8((i - 10) * 0x08 + 0x1E);
    clut[i * 4 + 3] = 255;
  }
  for (let i = 0; i < 10; ++i) {
    clut[i * 4 + 0] = SYSTEM_COLORS_LOWER[i * 4 + 0];
    clut[i * 4 + 1] = SYSTEM_COLORS_LOWER[i * 4 + 1];
    clut[i * 4 + 2] = SYSTEM_COLORS_LOWER[i * 4 + 2];
    clut[i * 4 + 3] = SYSTEM_COLORS_LOWER[i * 4 + 3];
  }
  for (let i = 246; i < 256; ++i) {
    clut[i * 4 + 0] = SYSTEM_COLORS_UPPER[(i - 246) * 4 + 0];
    clut[i * 4 + 1] = SYSTEM_COLORS_UPPER[(i - 246) * 4 + 1];
    clut[i * 4 + 2] = SYSTEM_COLORS_UPPER[(i - 246) * 4 + 2];
    clut[i * 4 + 3] = SYSTEM_COLORS_UPPER[(i - 246) * 4 + 3];
  }
  return true;
}

function buildYobiDisplay() {
  yobiBitmap = new TiledBitmap(901, 77);
  return true;
}

function drawYobiDisplay() {
  let c = document.getElementById('yobiCanvas');
  let ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  let faceIndex = 0;
  if (activeVoiceId > 0 && activeSoundSource !== undefined) {
    const voiceLine = voiceLines.get(activeVoiceId);
    const time = audioContext.currentTime - activeSoundStartTime;
    const kfIndex = Math.floor(time * 60);
    if (kfIndex < voiceLine.keyframes.length) {
      faceIndex = voiceLine.keyframes[kfIndex];
    }
  }
  yobiBitmap.draw(0, 0, faceIndex, ctx);

  window.requestAnimationFrame(drawYobiDisplay);
}

function parseDll(bytes) {
  if (bytes.length < 0x40) {
    showStatus('Error: DLL is too small');
    return false;
  }
  const lfarlc = bytes.getUint16(0x18, true);
  const lfanew = bytes.getUint8(0x3C);
  if (lfarlc != 0x40 || lfanew != 0x90) {
    showStatus('Error: Invalid or unexpected DLL file');
    return false;
  }
  
  const resourceTableOffset = bytes.getUint16(lfanew + 0x24, true);
  const align = 1 << bytes.getUint16(lfanew + resourceTableOffset, true);
  var offset = lfanew + resourceTableOffset + 0x02;
  while (offset < bytes.byteLength) {
    const typeId = bytes.getUint16(offset, true) & 0x7FFF;
    if (typeId === 0) break;
    const resourceCount = bytes.getUint16(offset + 0x02, true);
    offset += 0x08;
    for (let i = 0; i < resourceCount; ++i) {
      let resource = new DllResource(typeId)
      offset = resource.parse(bytes, offset, align);
      if (!dllResourceMap.has(resource.typeId)) {
        dllResourceMap.set(resource.typeId, new Map());
      }
      dllResourceMap.get(resource.typeId).set(resource.resourceId, resource);
    }
  }
  return true;
}

function openDll(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    dllBytes = reader.result;
    if (!parseDll(new DataView(dllBytes))) return;
    if (!buildVoiceBanks()) return;
    if (!buildClut()) return;
    if (!buildYobiDisplay()) return;

    document.getElementById('playSound').disabled = false;
    window.requestAnimationFrame(drawYobiDisplay);
    // showStatus("OK");
  };
  reader.onerror = () => {
    showStatus(`Error: ${reader.error.message}`);
  }
  reader.readAsArrayBuffer(file);
}

function onLoad() {
  document.getElementById('yobiDll').addEventListener('change', function(e) {
    const file = e.target.files[0];
    openDll(file);
  });
  document.getElementById('playSound').addEventListener('click', () => {
    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect.value) {
      playVoice(parseInt(voiceSelect.value));
    }
  });
  document.getElementById('volume').addEventListener("input", function() {
    audioGain.gain.value = this.value;
    const volumeDisplay = document.getElementById('volumeDisplay');
    volumeDisplay.innerHTML = `${(this.value * 100).toFixed(0)}%`;
  });
  document.getElementById('bankSelect').addEventListener('change', function(e) {
    selectVoiceBank(parseInt(e.target.value));
  });
  document.getElementById('voiceSelect').addEventListener('dblclick', function(e) {
    if (this.value) {
      playVoice(parseInt(this.value));
    }
  });
  document.getElementById('voiceSelect').addEventListener('keydown', function(e) {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && this.value) {
      playVoice(parseInt(this.value));
    }
  });
}

window.onload = function() {
  onLoad();
}
