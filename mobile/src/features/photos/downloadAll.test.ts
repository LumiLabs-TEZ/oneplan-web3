import { downloadAll, type DownloadAllDeps, type DownloadablePhoto } from './downloadAll';

function fakes(over: Partial<DownloadAllDeps> = {}) {
  const downloaded: string[] = [];
  const savedUris: string[] = [];
  const progress: [number, number][] = [];
  const deps: DownloadAllDeps = {
    listPhotos: async () => [
      { id: 1, url: 'https://cdn/1.jpg' },
      { id: 2, url: 'https://cdn/2.jpg' },
    ],
    requestPermission: async () => ({ granted: true }),
    download: async (url, fileUri) => {
      downloaded.push(`${url} -> ${fileUri}`);
      return { uri: fileUri };
    },
    saveToLibrary: async (fileUri) => {
      savedUris.push(fileUri);
    },
    cacheDir: 'file:///cache/',
    onProgress: (done, total) => progress.push([done, total]),
    ...over,
  };
  return { deps, downloaded, savedUris, progress };
}

describe('downloadAll', () => {
  it('downloads every photo into the cache dir and saves it to the library', async () => {
    const { deps, downloaded, savedUris, progress } = fakes();
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'success', saved: 2, total: 2 });
    expect(downloaded).toEqual([
      'https://cdn/1.jpg -> file:///cache/oneplan-1.jpg',
      'https://cdn/2.jpg -> file:///cache/oneplan-2.jpg',
    ]);
    expect(savedUris).toEqual(['file:///cache/oneplan-1.jpg', 'file:///cache/oneplan-2.jpg']);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('stops at permissionDenied without downloading anything', async () => {
    const { deps, downloaded } = fakes({ requestPermission: async () => ({ granted: false }) });
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'permissionDenied' });
    expect(downloaded).toEqual([]);
  });

  it('treats a thrown permission request as a denial', async () => {
    const { deps } = fakes({
      requestPermission: async () => {
        throw new Error('nope');
      },
    });
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'permissionDenied' });
  });

  it('skips photos without a url', async () => {
    const photos: DownloadablePhoto[] = [
      { id: 1, url: null },
      { id: 2, url: 'https://cdn/2.jpg' },
    ];
    const { deps, savedUris } = fakes({ listPhotos: async () => photos });
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'success', saved: 1, total: 1 });
    expect(savedUris).toEqual(['file:///cache/oneplan-2.jpg']);
  });

  it('keeps going when one photo fails and reports only what saved', async () => {
    const { deps, savedUris } = fakes({
      download: async (url, fileUri) => {
        if (url.endsWith('1.jpg')) throw new Error('404');
        return { uri: fileUri };
      },
    });
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'success', saved: 1, total: 2 });
    expect(savedUris).toEqual(['file:///cache/oneplan-2.jpg']);
  });

  it('fails when nothing could be saved', async () => {
    const { deps } = fakes({
      saveToLibrary: async () => {
        throw new Error('disk full');
      },
    });
    await expect(downloadAll(3, deps)).resolves.toMatchObject({ status: 'failure' });
  });

  it('reports a listing failure instead of throwing', async () => {
    const { deps } = fakes({
      listPhotos: async () => {
        throw new Error('offline');
      },
    });
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'failure', message: 'offline' });
  });

  it('short-circuits on an empty album (no permission prompt)', async () => {
    let asked = false;
    const { deps } = fakes({
      listPhotos: async () => [],
      requestPermission: async () => {
        asked = true;
        return { granted: true };
      },
    });
    await expect(downloadAll(3, deps)).resolves.toEqual({ status: 'success', saved: 0, total: 0 });
    expect(asked).toBe(false);
  });
});
