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

// Level Properties
const LEVEL_TILE_SIZE = 32;
const LEVEL_TILE_SIZE_HALF = 16;
const LEVEL_WIDTH = 15;
const LEVEL_HEIGHT = 12;

// Resource Types
const RS_TYPE_STR = 0x3ED;
const RS_TYPE_CLUT = 0x3EF;
const RS_TYPE_PICT = 0x3F3;
const RS_TYPE_GMRT = 0x406;
const RS_TYPE_GMLT = 0x407;

// Resource IDs (Background)
const RS_ID_BKG_GRASS = 2001;
const RS_ID_BKG_ROCKS = 2201;
const RS_ID_BKG_HOTCOAL = 2301;
const RS_ID_BKG_PIT = 2401;
const RS_ID_BKG_MUD = 2501;
const RS_ID_BKG_TREES = 4401;

// Resource IDs (Objects)
const RS_ID_RAFT = 3101;
const RS_ID_HIPPO = 3301;
const RS_ID_LETTER = 4001;
const RS_ID_TRINKET = 4100;
const RS_ID_TOMATO = 4110;
const RS_ID_BRIDGE = 4201;
const RS_ID_POTION = 4300;
const RS_ID_PLAYER = 5001;
const RS_ID_FIREDEMON = 5101;
const RS_ID_DARTDEMON = 5102;
const RS_ID_WINDDEMON = 5103;
const RS_ID_RHINOCEROS = 5201;
const RS_ID_ELEPHANT = 5202;
const RS_ID_TIGER = 5203;
const RS_ID_GAZELLE = 5204;
const RS_ID_ZEBRA = 5205;
const RS_ID_ALLIGATOR = 5207;
const RS_ID_LION = 5208;
const RS_ID_BOULDER = 5301;
const RS_ID_JEEP = 5401;

// {Resource Type ID (int) -> {Resource ID (int) -> DllResource}}
var dllResourceMap = new Map();
var dllBytes;

var clut = new Uint8ClampedArray(0x400);
var bkgLowerBitmap;
var hintBitmaps = [];
var wordList = [];
var levelTileMap = new Map();  // {Tile ID -> Tile}
var levelCount = 0;
var level;
// var lastTimestamp;

function showStatus(message) {
  if (message) {
    document.getElementById('statusContainer').style.display = 'block';
    document.getElementById('statusText').innerHTML = message;
  } else {
    document.getElementById('statusContainer').style.display = 'none';
    document.getElementById('statusText').innerHTML = '';
  }
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

class Tile {
  constructor(bitmap, tileIndex) {
    this.bitmap = bitmap;
    this.tileIndex = tileIndex;
  }

  draw(x, y, tileIndexOffset, ctx) {
    this.bitmap.draw(x, y, this.tileIndex + tileIndexOffset, ctx);
  }
}

function buildTilesForBitmap(resourceId, tileHeight) {
  bitmap = new TiledBitmap(resourceId, tileHeight);
  for (let i = 0; i < bitmap.tileCount; ++i) {
    levelTileMap.set(resourceId + i, new Tile(bitmap, i));
  }
}

class LevelTile {
  constructor(id, x, y, tileIndexOffset) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.tileIndexOffset = tileIndexOffset;

    if (!levelTileMap.has(id)) {
      console.error(`Level tile map is missing tile ID: ${id}`);
      return;
    }
    this.tile = levelTileMap.get(id);
  }

  draw(ctx) {
    if (!this.tile) return;
    this.tile.draw(this.x * 8, this.y * 8, this.tileIndexOffset, ctx);
  }
}

class Level {
  constructor(levelIndex) {
    let resourceId = 1001 + levelIndex;
    this.parseBkgLower(resourceId);
    this.parseBkgUpper(resourceId);
    this.parseObjects(resourceId + 1000);
    this.levelIndex = levelIndex;
  }

  parseBkgLower(resourceId) {
    let bkgLowerResource = getResource(RS_TYPE_GMRT, resourceId);
    if (!bkgLowerResource) {
      console.error(`Level resource not found: type ${RS_TYPE_GMRT}, id ${resourceId}`)
      return; 
    }

    this.bkgLowerTiles = new Uint8Array(LEVEL_WIDTH * LEVEL_HEIGHT)
    for (let i = 0; i < LEVEL_WIDTH * LEVEL_HEIGHT; ++i) {
      let index = bkgLowerResource.bytes.getUint16(i * 0x02, true);
      if (index === 1001) {
        this.bkgLowerTiles[i] = 47;
      } else if (index === 1501) {
        this.bkgLowerTiles[i] = 0;
      } else {
        this.bkgLowerTiles[i] = index - 1001;
      }
    }
  }

  parseBkgUpper(resourceId) {
    let bkgUpperResource = getResource(RS_TYPE_GMLT, resourceId);
    if (!bkgUpperResource) {
      console.error(`Level resource not found: type ${RS_TYPE_GMRT}, id ${resourceId}`)
      return;
    }
    let count = bkgUpperResource.bytes.getUint16(0x00, true);
    this.bkgUpperTiles = []
    for (let i = 0; i < count; ++i) {
      let id = bkgUpperResource.bytes.getUint16(i * 0x0A + 0x02, true);
      let x = bkgUpperResource.bytes.getUint16(i * 0x0A + 0x04, true);
      let y = bkgUpperResource.bytes.getUint16(i * 0x0A + 0x06, true);
      this.bkgUpperTiles.push(new LevelTile(id, x, y, 0))
    }
  }

  parseObjects(resourceId) {
    let objResource = getResource(RS_TYPE_GMLT, resourceId);
    if (!objResource) {
      console.error(`Level resource not found: type ${RS_TYPE_GMRT}, id ${resourceId}`)
      return;
    }
    let count = objResource.bytes.getUint16(0x00, true);
    this.objTiles = []
    for (let i = 0; i < count; ++i) {
      let id = objResource.bytes.getUint16(i * 0x0A + 0x02, true);
      let x = objResource.bytes.getUint16(i * 0x0A + 0x04, true);
      let y = objResource.bytes.getUint16(i * 0x0A + 0x06, true);
      let direction = objResource.bytes.getUint16(i * 0x0A + 0x08, true);
      let tileIndexOffset = 0;
      if (id === RS_ID_TOMATO + 1) {
        tileIndexOffset = -1;
      } else if (id > RS_ID_POTION && id < RS_ID_POTION + 100) {
        tileIndexOffset = -1;
      } else if (id === RS_ID_JEEP) {
        tileIndexOffset = Math.floor((direction - 1) / 2) % 2;
      } else if (id === RS_ID_WINDDEMON) {
        tileIndexOffset = direction - 1;
      } else {
        tileIndexOffset = (direction - 1) * 2
      }
      this.objTiles.push(new LevelTile(id, x, y, tileIndexOffset))
    }
  }

  draw(ctx) {
    if (!bkgLowerBitmap) return;

    for (let i = 0; i < LEVEL_WIDTH * LEVEL_HEIGHT; ++i) {
      let index = this.bkgLowerTiles[i];
      let x = i % LEVEL_WIDTH * LEVEL_TILE_SIZE;
      let y = Math.floor(i / LEVEL_WIDTH) * LEVEL_TILE_SIZE;
      bkgLowerBitmap.draw(x, y, index, ctx);
    }

    this.bkgUpperTiles.forEach((tile) => {
      tile.draw(ctx);
    });
    this.objTiles.forEach((tile) => {
      tile.draw(ctx);
    });
    let hintBitmap = hintBitmaps[this.levelIndex];
    if (hintBitmap) {
      ctx.drawImage(hintBitmap, 0, 385);
    }
  }

  valid() {
    return this.bkgLowerTiles !== undefined;
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

function loadLevel(index) {
  level = new Level(index);

  const prevLevel = document.getElementById('prevLevel');
  prevLevel.disabled = (index === 0);

  const nextLevel = document.getElementById('nextLevel');
  nextLevel.disabled = (index === levelCount - 1);
}

function nextLevel() {
  let levelSelect = document.getElementById('levelSelect');
  let levelIndex = parseInt(levelSelect.value);
  if (levelIndex < levelCount - 1) {
    levelIndex++;
  }
  levelSelect.value = `${levelIndex}`;
  levelSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function prevLevel() {
  let levelSelect = document.getElementById('levelSelect');
  let levelIndex = parseInt(levelSelect.value);
  if (levelIndex > 0) {
    levelIndex--;
  }
  levelSelect.value = `${levelIndex}`;
  levelSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function buildWordList() {
  wordListResource = getResource(RS_TYPE_STR, 201);
  if (!wordListResource) return false;
  const count = wordListResource.bytes.getUint16(0x00, true);
  let offset = 0x02;
  for (let i = 0; i < count; ++i) {
    let len = wordListResource.bytes.getUint8(offset++);
    let str = '';
    for (let j = 0; j < len; ++j) {
      str += String.fromCharCode(wordListResource.bytes.getUint8(offset++));
    }
    wordList.push(str);
  }
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

function buildLevelBitmaps() {
  bkgLowerBitmap = new TiledBitmap(1500, LEVEL_TILE_SIZE);
  if (!bkgLowerBitmap) return false;

  // Upper BKG tiles
  buildTilesForBitmap(RS_ID_BKG_GRASS, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_BKG_ROCKS, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_BKG_HOTCOAL, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_BKG_PIT, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_BKG_MUD, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_BKG_TREES, LEVEL_TILE_SIZE);

  // Game object tiles
  buildTilesForBitmap(RS_ID_RAFT, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_HIPPO, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_LETTER, LEVEL_TILE_SIZE_HALF);
  buildTilesForBitmap(RS_ID_TRINKET, LEVEL_TILE_SIZE_HALF);
  buildTilesForBitmap(RS_ID_TOMATO, LEVEL_TILE_SIZE_HALF);
  buildTilesForBitmap(RS_ID_BRIDGE, LEVEL_TILE_SIZE_HALF);
  buildTilesForBitmap(RS_ID_POTION, LEVEL_TILE_SIZE_HALF);
  buildTilesForBitmap(RS_ID_PLAYER, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_FIREDEMON, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_DARTDEMON, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_WINDDEMON, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_RHINOCEROS, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_ELEPHANT, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_TIGER, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_GAZELLE, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_ZEBRA, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_ALLIGATOR, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_LION, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_BOULDER, LEVEL_TILE_SIZE);
  buildTilesForBitmap(RS_ID_JEEP, LEVEL_TILE_SIZE);

  return true;
}

function buildLevels() {
  levelCount = dllResourceMap.get(RS_TYPE_GMRT).size;
  const levelSelect = document.getElementById('levelSelect');
  for (let i = 0; i < levelCount; ++i) {
    let option = document.createElement('option');
    option.value = i;
    option.innerHTML = `Level ${i + 1}: ${wordList[i].toUpperCase()}`;
    levelSelect.appendChild(option);
  }
  const nextLevel = document.getElementById('nextLevel');
  nextLevel.disabled = false;

  hintBitmaps.length = levelCount;
  for (let i = 0; i < levelCount; ++i) {
    let imageData = parseBitmapResource(1001 + i);
    createImageBitmap(imageData).then((result) => {
      hintBitmaps[i] = result;
    });
  }

  // Load the first level
  loadLevel(0);

  return true;
}

function drawLevel() {
  // if (lastTimestamp === undefined) {
  //   lastTimestamp = timestamp;
  // }
  // let deltaTime = timestamp - lastTimestamp;

  let c = document.getElementById('yobiCanvas');
  let ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 384, 480, 400);

  level.draw(ctx)

  window.requestAnimationFrame(drawLevel);
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
    if (!buildWordList()) return;
    if (!buildClut()) return;
    if (!buildLevelBitmaps()) return;
    if (!buildLevels()) return;

    window.requestAnimationFrame(drawLevel);
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
  document.getElementById('levelSelect').addEventListener('change', function(e) {
    loadLevel(parseInt(e.target.value));
  });
  document.getElementById('prevLevel').addEventListener('click', function(e) {
    prevLevel();
  });
  document.getElementById('nextLevel').addEventListener('click', function(e) {
    nextLevel();
  });
}

window.onload = function() {
  onLoad();
}
