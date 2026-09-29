import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import * as imagePick from '@/native/imagePick';

import { PhotosSection } from './PhotosSection';

describe('PhotosSection', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows the add tile when slots remain and hides it at 0', async () => {
    const { rerender } = await render(
      <PhotosSection
        existingImageUrls={['a']}
        newImageUris={[]}
        remainingSlots={4}
        onAddImages={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemoveNew={jest.fn()}
      />,
    );
    expect(screen.getByTestId('plan-photos-add')).toBeTruthy();

    await rerender(
      <PhotosSection
        existingImageUrls={['a', 'b', 'c', 'd', 'e']}
        newImageUris={[]}
        remainingSlots={0}
        onAddImages={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemoveNew={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('plan-photos-add')).toBeNull();
  });

  it('picks up to the remaining slots and forwards the uris', async () => {
    jest.spyOn(imagePick, 'pickImages').mockResolvedValue(['x.jpg', 'y.jpg']);
    const onAddImages = jest.fn();
    await render(
      <PhotosSection
        existingImageUrls={[]}
        newImageUris={[]}
        remainingSlots={2}
        onAddImages={onAddImages}
        onRemoveExisting={jest.fn()}
        onRemoveNew={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-photos-add'));
    await Promise.resolve();
    expect(imagePick.pickImages).toHaveBeenCalledWith(2);
    expect(onAddImages).toHaveBeenCalledWith(['x.jpg', 'y.jpg']);
  });

  it('fires onRemoveExisting/onRemoveNew with the tapped index', async () => {
    const onRemoveExisting = jest.fn();
    const onRemoveNew = jest.fn();
    await render(
      <PhotosSection
        existingImageUrls={['a', 'b']}
        newImageUris={['c']}
        remainingSlots={2}
        onAddImages={jest.fn()}
        onRemoveExisting={onRemoveExisting}
        onRemoveNew={onRemoveNew}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-photos-remove-existing-1'));
    expect(onRemoveExisting).toHaveBeenCalledWith(1);
    await fireEvent.press(screen.getByTestId('plan-photos-remove-new-0'));
    expect(onRemoveNew).toHaveBeenCalledWith(0);
  });
});
