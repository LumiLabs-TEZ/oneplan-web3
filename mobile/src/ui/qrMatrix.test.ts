import QRCode from 'qrcode';
import { qrMatrix } from './qrMatrix';

test('preserves every encoded bit and the CoreImage one-module border', () => {
  const value = 'https://op.oneplan.space/friend/abc123';
  const matrix = qrMatrix(value)!;
  const expected = QRCode.create(
    [{ data: Uint8Array.from(value, (c) => c.charCodeAt(0)), mode: 'byte' }],
    { errorCorrectionLevel: 'H' },
  ).modules;
  expect(matrix.length).toBe(expected.size + 2);
  for (let y = 0; y < expected.size; y++) {
    for (let x = 0; x < expected.size; x++)
      expect(matrix[y + 1]![x + 1]).toBe(Number(expected.get(y, x)));
  }
  expect(matrix[0]!.every((bit) => bit === 0)).toBe(true);
  expect(matrix.at(-1)!.every((bit) => bit === 0)).toBe(true);
  expect(matrix.every((row) => row[0] === 0 && row.at(-1) === 0)).toBe(true);
});

test('unsupported content fails into the source unavailable state', () => {
  expect(qrMatrix('')).toBeNull();
  expect(qrMatrix('Đà Lạt')).toBeNull();
  expect(qrMatrix('x'.repeat(10000))).toBeNull();
});
