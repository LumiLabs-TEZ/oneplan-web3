import { requireNativeModule } from 'expo';

export function qrMatrix(content: string): number[][] | null {
  return requireNativeModule<{ qrMatrix(content: string): number[][] | null }>('ParityUI').qrMatrix(
    content,
  );
}
