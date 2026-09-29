import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ImageViewerModal } from './ImageViewerModal';
import { initI18n } from '@/i18n';
beforeAll(() => initI18n());

const images = ['https://img.test/1.jpg', 'https://img.test/2.jpg', 'https://img.test/3.jpg'];

describe('ImageViewerModal', () => {
  it('renders the n/total counter for the initial index', async () => {
    await render(<ImageViewerModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.getByRole('text', { name: '1/3' })).toBeTruthy();
  });

  it('honors a non-zero initial index', async () => {
    await render(<ImageViewerModal images={images} initialIndex={2} visible onClose={jest.fn()} />);
    expect(screen.getByRole('text', { name: '3/3' })).toBeTruthy();
  });

  it('fires onClose when the dismiss button is pressed', async () => {
    const onClose = jest.fn();
    await render(<ImageViewerModal images={images} initialIndex={0} visible onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while not visible', async () => {
    await render(
      <ImageViewerModal images={images} initialIndex={0} visible={false} onClose={jest.fn()} />,
    );
    expect(screen.queryByRole('text', { name: '1/3' })).toBeNull();
  });
});

it('keeps a labelled dismissal control when opened from a thumbnail group', async () => {
  const onClose = jest.fn();
  await render(
    <ImageViewerModal
      images={images}
      initialIndex={1}
      visible
      onClose={onClose}
      triggerId="strip"
    />,
  );
  expect(screen.getByRole('text', { name: '2/3' })).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('resets the selected photo when reopened on a different thumbnail', async () => {
  const onClose = jest.fn();
  const view = await render(
    <ImageViewerModal images={images} initialIndex={2} visible onClose={onClose} />,
  );
  await act(async () =>
    view.rerender(
      <ImageViewerModal images={images} initialIndex={2} visible={false} onClose={onClose} />,
    ),
  );
  await act(async () =>
    view.rerender(<ImageViewerModal images={images} initialIndex={0} visible onClose={onClose} />),
  );
  expect(screen.getByRole('text', { name: '1/3' })).toBeTruthy();
});
