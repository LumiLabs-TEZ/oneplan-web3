import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { SharedAlbumCard } from './SharedAlbumCard';

const previews = ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'];

describe('SharedAlbumCard', () => {
  beforeAll(() => {
    initI18n();
  });

  it('cycles the button label idle → progress → saved', async () => {
    const screen = await render(
      <SharedAlbumCard
        photoCount={12}
        previews={previews}
        state={{ kind: 'idle' }}
        onDownload={jest.fn()}
      />,
    );
    expect(screen.getByText('Download all')).toBeTruthy();

    await screen.rerender(
      <SharedAlbumCard
        photoCount={12}
        previews={previews}
        state={{ kind: 'downloading', done: 4, total: 12 }}
        onDownload={jest.fn()}
      />,
    );
    expect(screen.getByText('4/12')).toBeTruthy();
    expect(screen.getByTestId('shared-album-progress')).toBeTruthy();
    expect(screen.queryByTestId('shared-album-previews')).toBeNull();

    await screen.rerender(
      <SharedAlbumCard
        photoCount={12}
        previews={previews}
        state={{ kind: 'done', saved: 11 }}
        onDownload={jest.fn()}
      />,
    );
    expect(screen.getByText('Saved 11')).toBeTruthy();
  });

  it('pluralizes the photo count', async () => {
    const one = await render(
      <SharedAlbumCard
        photoCount={1}
        previews={previews}
        state={{ kind: 'idle' }}
        onDownload={jest.fn()}
      />,
    );
    expect(one.getByText('1 photo uploaded by all members.')).toBeTruthy();

    const many = await render(
      <SharedAlbumCard
        photoCount={3}
        previews={previews}
        state={{ kind: 'idle' }}
        onDownload={jest.fn()}
      />,
    );
    expect(many.getByText('3 photos uploaded by all members.')).toBeTruthy();
  });

  it('downloads once and is disabled while running', async () => {
    const onDownload = jest.fn();
    const screen = await render(
      <SharedAlbumCard
        photoCount={2}
        previews={previews}
        state={{ kind: 'idle' }}
        onDownload={onDownload}
      />,
    );
    await fireEvent.press(screen.getByTestId('shared-album-download'));
    expect(onDownload).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <SharedAlbumCard
        photoCount={2}
        previews={previews}
        state={{ kind: 'downloading', done: 1, total: 2 }}
        onDownload={onDownload}
      />,
    );
    await fireEvent.press(screen.getByTestId('shared-album-download'));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('holds the download while the album is still paging in', async () => {
    const onDownload = jest.fn();
    const screen = await render(
      <SharedAlbumCard
        photoCount={20}
        previews={previews}
        state={{ kind: 'idle' }}
        disabled
        onDownload={onDownload}
      />,
    );
    expect(screen.getByTestId('shared-album-download').props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByTestId('shared-album-download'));
    expect(onDownload).not.toHaveBeenCalled();
  });
});
