import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PlanImageStrip } from './PlanImageStrip';

const images = ['https://img.test/1.jpg', 'https://img.test/2.jpg'];

describe('PlanImageStrip', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders nothing for an empty image list', async () => {
    const { toJSON } = await render(<PlanImageStrip images={[]} testID="strip" />);
    expect(toJSON()).toBeNull();
  });

  it('opens the image viewer at the tapped index when onRemove is not provided', async () => {
    await render(<PlanImageStrip images={images} testID="strip" />);
    await fireEvent.press(screen.getByTestId('strip-thumb-1'));
    expect(screen.getByRole('text', { name: '2/2' })).toBeTruthy();
  });

  it('renders a remove button per thumbnail and fires onRemove instead of opening the viewer', async () => {
    const onRemove = jest.fn();
    await render(<PlanImageStrip images={images} onRemove={onRemove} testID="strip" />);
    expect(screen.getAllByLabelText('Remove')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('strip-remove-1'));
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('text', { name: '2/2' })).toBeNull();
  });
});
