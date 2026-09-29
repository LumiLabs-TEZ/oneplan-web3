import { act, renderHook } from '@testing-library/react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { useVoicePlayer } from './player';

const mockedUseAudioPlayer = useAudioPlayer as jest.Mock;
const mockedUseAudioPlayerStatus = useAudioPlayerStatus as jest.Mock;

const mockUseDownloadUrl = jest.fn();
jest.mock('@/features/plan/api/queries', () => ({
  useDownloadUrl: (key: string | null) => mockUseDownloadUrl(key),
}));

function makePlayer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'test-player',
    playing: false,
    currentTime: 0,
    duration: 0,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    ...overrides,
  };
}

function statusFor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'test-player',
    currentTime: 0,
    playbackState: 'idle',
    timeControlStatus: 'paused',
    reasonForWaitingToPlay: '',
    mute: false,
    duration: 0,
    playing: false,
    loop: false,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: true,
    playbackRate: 1,
    shouldCorrectPitch: true,
    isLive: false,
    currentOffsetFromLive: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockedUseAudioPlayer.mockReset();
  mockedUseAudioPlayerStatus.mockReset();
  mockUseDownloadUrl.mockReset().mockReturnValue({ data: undefined });
});

describe('useVoicePlayer', () => {
  it('plays an http(s) source directly, without resolving a download url', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor());

    const { result } = await renderHook(() => useVoicePlayer('https://cdn.example.com/voice.m4a'));
    await act(async () => {
      result.current.toggle();
    });

    expect(mockUseDownloadUrl).toHaveBeenCalledWith(null);
    expect(mockedUseAudioPlayer).toHaveBeenCalledWith('https://cdn.example.com/voice.m4a');
    expect(player.play).toHaveBeenCalled();
  });

  it('resolves a non-http object key through useDownloadUrl before playing', async () => {
    mockUseDownloadUrl.mockReturnValue({ data: 'https://signed.example.com/voice.m4a' });
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor());

    const { result } = await renderHook(() => useVoicePlayer('trips/1/voice.m4a'));
    await act(async () => {
      result.current.toggle();
    });

    expect(mockUseDownloadUrl).toHaveBeenCalledWith('trips/1/voice.m4a');
    expect(mockedUseAudioPlayer).toHaveBeenCalledWith('https://signed.example.com/voice.m4a');
    expect(player.play).toHaveBeenCalled();
  });

  it('does nothing when source is null', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor());

    const { result } = await renderHook(() => useVoicePlayer(null));
    await act(async () => {
      result.current.toggle();
    });

    expect(player.play).not.toHaveBeenCalled();
  });

  it('toggle pauses when the same source is already playing', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor());

    const { result, rerender } = await renderHook(() =>
      useVoicePlayer('https://cdn.example.com/voice.m4a'),
    );
    await act(async () => {
      result.current.toggle();
    });
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor({ playing: true }));
    await rerender({});
    await act(async () => {
      result.current.toggle();
    });

    expect(player.pause).toHaveBeenCalled();
  });

  it('resets to the start and pauses when playback finishes', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor());

    const { rerender } = await renderHook(() =>
      useVoicePlayer('https://cdn.example.com/voice.m4a'),
    );

    mockedUseAudioPlayerStatus.mockReturnValue(statusFor({ didJustFinish: true, playing: true }));
    await rerender({});

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.pause).toHaveBeenCalled();
  });

  it('reports playing state and progress from the status', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(
      statusFor({ playing: true, currentTime: 3, duration: 12 }),
    );

    const { result } = await renderHook(() => useVoicePlayer('https://cdn.example.com/voice.m4a'));

    expect(result.current.playing).toBe(true);
    expect(result.current.progress).toBeCloseTo(0.25);
  });

  it('reports 0 progress when duration is unknown', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor({ currentTime: 3, duration: 0 }));

    const { result } = await renderHook(() => useVoicePlayer('https://cdn.example.com/voice.m4a'));

    expect(result.current.progress).toBe(0);
  });

  it('stop() pauses and seeks to the start', async () => {
    const player = makePlayer();
    mockedUseAudioPlayer.mockReturnValue(player);
    mockedUseAudioPlayerStatus.mockReturnValue(statusFor());

    const { result } = await renderHook(() => useVoicePlayer('https://cdn.example.com/voice.m4a'));
    await act(async () => {
      result.current.stop();
    });

    expect(player.pause).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledWith(0);
  });
});
