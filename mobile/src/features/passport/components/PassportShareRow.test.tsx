import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PassportShareRow } from './PassportShareRow';

describe('PassportShareRow', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders the three share labels', async () => {
    const screen = await render(<PassportShareRow onShare={jest.fn()} testID="share" />);
    expect(screen.getByText('IG Stories')).toBeTruthy();
    expect(screen.getByText('Message')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
  });

  it('calls onShare with "instagram" for the IG Stories button', async () => {
    const onShare = jest.fn();
    const screen = await render(<PassportShareRow onShare={onShare} testID="share" />);
    await fireEvent.press(screen.getByTestId('share-instagram'));
    expect(onShare).toHaveBeenCalledWith('instagram');
  });

  it('calls onShare with "message" for the Message button', async () => {
    const onShare = jest.fn();
    const screen = await render(<PassportShareRow onShare={onShare} testID="share" />);
    await fireEvent.press(screen.getByTestId('share-message'));
    expect(onShare).toHaveBeenCalledWith('message');
  });

  it('calls onShare with "photos" for the Photos button', async () => {
    const onShare = jest.fn();
    const screen = await render(<PassportShareRow onShare={onShare} testID="share" />);
    await fireEvent.press(screen.getByTestId('share-photos'));
    expect(onShare).toHaveBeenCalledWith('photos');
  });
});
