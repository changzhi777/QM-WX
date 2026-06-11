#!/usr/bin/env node
/**
 * generate-icons.mjs — 生成 8 个 tabBar 占位图标
 *
 * 跑法：node generate-icons.mjs
 * 输出：8 个 64x64 PNG（4 tab × 2 状态）
 *
 * 设计前先用这个跑一遍，开发期够用。正式上线前替换为设计师出的图。
 *
 * 颜色：
 *   - 灰底（未选）：#999999
 *   - 青沐绿（选中）：#0FAF8E
 *
 * 图形：
 *   home   → 实心方块
 *   sport  → 圆环（圆形外框）
 *   mall   → 三角形
 *   mine   → 圆
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 64;
const GREY = [0x99, 0x99, 0x99, 0xff];
const BRAND = [0x0f, 0xaf, 0x8e, 0xff];
const BG = [0, 0, 0, 0]; // 透明

// ===== 简单 PNG 编码（无依赖）=====

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(pixels) {
  // pixels: Uint8Array RGBA
  // 每行前缀一个 filter byte (0)
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter
    pixels.subarray(y * stride, (y + 1) * stride).copy
      ? pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
      : Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const compressed = deflateSync(raw);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ===== 画图工具 =====

function makeCanvas() {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    pixels[i * 4] = BG[0];
    pixels[i * 4 + 1] = BG[1];
    pixels[i * 4 + 2] = BG[2];
    pixels[i * 4 + 3] = BG[3];
  }
  return pixels;
}

function setPx(pixels, x, y, c) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i] = c[0];
  pixels[i + 1] = c[1];
  pixels[i + 2] = c[2];
  pixels[i + 3] = c[3];
}

function fillRect(pixels, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) setPx(pixels, x, y, c);
}

function fillCircle(pixels, cx, cy, r, c) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d <= r * r) setPx(pixels, x, y, c);
    }
}

function strokeCircle(pixels, cx, cy, r, thickness, c) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d >= r - thickness && d <= r) setPx(pixels, x, y, c);
    }
}

function fillTriangle(pixels, c) {
  // 等边三角形，顶点在上
  const top = [SIZE / 2, 10];
  const bl = [10, SIZE - 10];
  const br = [SIZE - 10, SIZE - 10];
  for (let y = top[1]; y <= SIZE - 10; y++) {
    const t = (y - top[1]) / (SIZE - 10 - top[1]);
    const xl = top[0] + (bl[0] - top[0]) * t;
    const xr = top[0] + (br[0] - top[0]) * t;
    for (let x = Math.ceil(xl); x <= Math.floor(xr); x++) setPx(pixels, x, y, c);
  }
}

// ===== 4 个图标 =====
const drawHome = (color) => {
  const c = makeCanvas();
  fillRect(c, 12, 24, 40, 32, color); // 主体
  fillTriangle(c, color); // 屋顶
  fillRect(c, 26, 36, 12, 20, BG); // 门洞
  return c;
};

const drawSport = (color) => {
  const c = makeCanvas();
  strokeCircle(c, SIZE / 2, SIZE / 2, 22, 4, color);
  fillCircle(c, SIZE / 2, SIZE / 2, 6, color);
  return c;
};

const drawMall = (color) => {
  const c = makeCanvas();
  fillTriangle(c, color);
  return c;
};

const drawMine = (color) => {
  const c = makeCanvas();
  fillCircle(c, SIZE / 2, 22, 10, color); // 头
  fillRect(c, 16, 36, 32, 20, color); // 身
  return c;
};

const ICONS = {
  home: drawHome,
  sport: drawSport,
  mall: drawMall,
  mine: drawMine,
};

// ===== 输出 =====
for (const [name, draw] of Object.entries(ICONS)) {
  for (const [suffix, color] of [['grey', GREY], ['active', BRAND]]) {
    const pixels = draw(color);
    const png = encodePng(pixels);
    const file = join(__dirname, `${name}${suffix === 'active' ? '-active' : ''}.png`);
    writeFileSync(file, png);
    console.log(`✓ ${name}${suffix === 'active' ? '-active' : ''}.png  (${png.length} bytes)`);
  }
}

console.log('\n所有占位图标已生成。设计稿到位后覆盖即可。');
