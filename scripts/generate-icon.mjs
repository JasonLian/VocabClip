import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const size = 128;
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const offset = row + 1 + x * 4;
    const leftStroke = 32 + (y - 28) * 0.43;
    const rightStroke = 96 - (y - 28) * 0.43;
    const inV = y > 28 && y < 101 && (Math.abs(x - leftStroke) < 7 || Math.abs(x - rightStroke) < 7);
    raw[offset] = inV ? 255 : 52;
    raw[offset + 1] = inV ? 255 : 87;
    raw[offset + 2] = inV ? 255 : 213;
    raw[offset + 3] = 255;
  }
}

const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  chunk("IHDR", Buffer.from([0, 0, 0, size, 0, 0, 0, size, 8, 6, 0, 0, 0])),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await writeFile(path.join(root, "extension", "icon.png"), png);

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
