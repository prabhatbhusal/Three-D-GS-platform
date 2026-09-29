import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageKind, imageSize } from '../src/routes/assets.js';

test('a photo’s size comes from its header, turned the way a phone took it', () => {
  // JPEG: an EXIF block saying "turn 90°" (orientation 6), then a 3000 × 1000 frame
  const exif = Buffer.from([
    0xff, 0xe1, 0x00, 0x22, ...Buffer.from('Exif\0\0', 'latin1'),
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF, little-endian, IFD0 at 8
    0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // one entry: orientation = 6
    0x00, 0x00, 0x00, 0x00
  ]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0xe8, 0x0b, 0xb8, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), exif, sof]);
  assert.equal(imageKind(jpeg), 'jpg');
  assert.deepEqual(imageSize(jpeg, 'jpg'), [1000, 3000], 'shown upright: tall');
  assert.deepEqual(imageSize(Buffer.concat([Buffer.from([0xff, 0xd8]), sof]), 'jpg'), [3000, 1000], 'no EXIF: as stored');

  // WebP (extended): width-1 and height-1 as 24-bit numbers
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'latin1'); webp.write('WEBPVP8X', 8, 'latin1');
  webp.writeUIntLE(1919, 24, 3); webp.writeUIntLE(1079, 27, 3);
  assert.deepEqual(imageSize(webp, imageKind(webp)), [1920, 1080]);

  assert.equal(imageSize(Buffer.from([0xff, 0xd8, 0xff]), 'jpg'), null, 'cut short: no size, no crash');
});
