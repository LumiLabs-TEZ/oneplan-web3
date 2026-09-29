import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
export interface ReceiptPhoto {
  uri: string;
  width: number;
  height: number;
}
export function receiptResize(width: number, height: number) {
  if (Math.max(width, height) <= 1024) return null;
  return width >= height ? { width: 1024 } : { height: 1024 };
}
export async function prepareReceiptPhoto(photo: ReceiptPhoto): Promise<ReceiptPhoto> {
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    const resize = receiptResize(photo.width, photo.height);
    if (resize) context.resize(resize);
    const rendered = await context.renderAsync();
    try {
      return await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}
