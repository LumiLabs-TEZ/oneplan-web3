import { createMMKV, type MMKV } from 'react-native-mmkv';

/** Single app-wide MMKV instance. Under Jest `createMMKV` returns an in-memory mock. */
export const storage: MMKV = createMMKV({ id: 'oneplan' });

/** Zustand `persist` storage adapter over MMKV (synchronous). */
export const zustandMMKVStorage = {
  getItem: (name: string): string | null => storage.getString(name) ?? null,
  setItem: (name: string, value: string): void => {
    storage.set(name, value);
  },
  removeItem: (name: string): void => {
    storage.remove(name);
  },
};
