import QRCode from 'qrcode';

/** CoreImage's generator includes one blank module around its H-correction matrix. */
export function qrMatrix(content: string): number[][] | null {
  if (!content || /[^\x00-\x7f]/.test(content)) return null;
  try {
    const { modules } = QRCode.create(
      [{ data: Uint8Array.from(content, (character) => character.charCodeAt(0)), mode: 'byte' }],
      {
        errorCorrectionLevel: 'H',
      },
    );
    const size = modules.size + 2;
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) =>
        row > 0 && row < size - 1 && column > 0 && column < size - 1
          ? Number(modules.get(row - 1, column - 1))
          : 0,
      ),
    );
  } catch {
    return null;
  }
}

/** Same 0.98 module size / 0.16 corner radius as StyledQRCodeView.swift. */
export function roundedQrPath(matrix: number[][]): string {
  const paths: string[] = [];
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      const left = x + 0.01;
      const top = y + 0.01;
      paths.push(
        `M${left + 0.16} ${top}h0.66a0.16 0.16 0 0 1 0.16 0.16v0.66a0.16 0.16 0 0 1 -0.16 0.16h-0.66a0.16 0.16 0 0 1 -0.16 -0.16v-0.66a0.16 0.16 0 0 1 0.16 -0.16z`,
      );
    }),
  );
  return paths.join('');
}
