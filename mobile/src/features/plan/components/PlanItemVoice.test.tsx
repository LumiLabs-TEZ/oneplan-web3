import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { initI18n } from '@/i18n';

import type { PlanItemDto } from '../types';
import { PlanItemVoice } from './PlanItemVoice';

const mockUseVoicePlayer = jest.fn();
jest.mock('@/native/audio', () => ({
  useVoicePlayer: (source: string | null) => mockUseVoicePlayer(source),
}));

const mockUseDownloadUrl = jest.fn();
jest.mock('@/features/plan/api/queries', () => ({
  useDownloadUrl: (key: string | null) => mockUseDownloadUrl(key),
}));

beforeAll(() => {
  initI18n();
});

function item(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: 1,
    tripId: 1,
    title: 'Breakfast',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    voiceUrl: 'https://cdn.test/voice.m4a',
    voiceDuration: 12,
    ...overrides,
  };
}

function renderVoice(props: {
  item: PlanItemDto;
  active: boolean;
  onActivate: (id: number) => void;
}) {
  return render(
    <PlanItemVoice {...props}>
      {(voice) => (
        <Pressable testID="pill" onPress={voice.onToggle}>
          <Text>{voice.playing ? 'playing' : 'paused'}</Text>
        </Pressable>
      )}
    </PlanItemVoice>,
  );
}

beforeEach(() => {
  mockUseVoicePlayer.mockReset();
  mockUseDownloadUrl.mockReset().mockReturnValue({ isError: false });
});

describe('PlanItemVoice', () => {
  it('toggles playback and activates itself on press', async () => {
    const toggle = jest.fn();
    mockUseVoicePlayer.mockReturnValue({ playing: false, progress: 0, toggle, stop: jest.fn() });
    const onActivate = jest.fn();

    await renderVoice({ item: item(), active: false, onActivate });
    await fireEvent.press(screen.getByTestId('pill'));

    expect(onActivate).toHaveBeenCalledWith(1);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('reflects the player state passed to children', async () => {
    mockUseVoicePlayer.mockReturnValue({
      playing: true,
      progress: 0.5,
      toggle: jest.fn(),
      stop: jest.fn(),
    });
    await renderVoice({ item: item(), active: true, onActivate: jest.fn() });
    expect(screen.getByText('playing')).toBeTruthy();
  });

  it('stops playback when another item becomes active', async () => {
    const stop = jest.fn();
    mockUseVoicePlayer.mockReturnValue({ playing: true, progress: 0.2, toggle: jest.fn(), stop });
    const { rerender } = await renderVoice({ item: item(), active: true, onActivate: jest.fn() });

    await rerender(
      <PlanItemVoice item={item()} active={false} onActivate={jest.fn()}>
        {(voice) => (
          <Pressable testID="pill" onPress={voice.onToggle}>
            <Text>{voice.playing ? 'playing' : 'paused'}</Text>
          </Pressable>
        )}
      </PlanItemVoice>,
    );

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('alerts and does not toggle when the voice failed to resolve', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const toggle = jest.fn();
    mockUseVoicePlayer.mockReturnValue({ playing: false, progress: 0, toggle, stop: jest.fn() });
    mockUseDownloadUrl.mockReturnValue({ isError: true });

    await renderVoice({ item: item(), active: false, onActivate: jest.fn() });
    await fireEvent.press(screen.getByTestId('pill'));

    expect(alertSpy).toHaveBeenCalledWith('Unable to play voice message.');
    expect(toggle).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
