import { act, renderHook } from '@testing-library/react-native';
import { AudioModule, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { useVoiceRecorder } from './recorder';

const mockedUseAudioRecorder = useAudioRecorder as jest.Mock;
const mockedUseAudioRecorderState = useAudioRecorderState as jest.Mock;
const mockedRequestPermissions = AudioModule.requestRecordingPermissionsAsync as jest.Mock;

function makeRecorder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'test-recorder',
    currentTime: 0,
    isRecording: false,
    uri: null as string | null,
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    pause: jest.fn(),
    prepareToRecordAsync: jest.fn(async () => undefined),
    getStatus: jest.fn(),
    ...overrides,
  };
}

function stateFor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    metering: -160,
    url: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockedUseAudioRecorder.mockReset();
  mockedUseAudioRecorderState.mockReset();
  mockedRequestPermissions.mockReset().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  });
  (Haptics.impactAsync as jest.Mock).mockClear();
});

describe('useVoiceRecorder', () => {
  it('starts idle', async () => {
    const recorder = makeRecorder();
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    expect(result.current.status).toBe('idle');
    expect(result.current.bars).toEqual([]);
    expect(result.current.uri).toBeNull();
  });

  it('start() requests permission, configures the session, prepares and records', async () => {
    const recorder = makeRecorder();
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    expect(mockedRequestPermissions).toHaveBeenCalled();
    expect(recorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalled();
    expect(result.current.status).toBe('recording');
    expect(result.current.error).toBeNull();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('sets an error and stays idle when permission is denied', async () => {
    mockedRequestPermissions.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    });
    const recorder = makeRecorder();
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    expect(recorder.record).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('permission_denied');
  });

  it('accumulates metering samples into bars while recording', async () => {
    const recorder = makeRecorder();
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result, rerender } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    // The initial poll (default -160dB, before the mocked update below) already pushed one
    // sample at 0 — real metering starts flowing as soon as the recorder reports a level.
    expect(result.current.bars).toEqual([0]);

    mockedUseAudioRecorderState.mockReturnValue(stateFor({ durationMillis: 100, metering: -30 }));
    await rerender({});
    expect(result.current.bars).toEqual([0, 0.5]);

    mockedUseAudioRecorderState.mockReturnValue(stateFor({ durationMillis: 200, metering: 0 }));
    await rerender({});
    expect(result.current.bars).toEqual([0, 0.5, 1]);
  });

  it('reports live elapsed seconds while recording (the card timer)', async () => {
    mockedUseAudioRecorder.mockReturnValue(makeRecorder());
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result, rerender } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.seconds).toBe(0);

    mockedUseAudioRecorderState.mockReturnValue(stateFor({ durationMillis: 3_400 }));
    await rerender({});
    expect(result.current.seconds).toBe(3);
  });

  it('stop() finalizes seconds (rounded, minimum 1) and the uri, moving to recorded', async () => {
    const recorder = makeRecorder({ currentTime: 4.6, uri: 'file:///voice.m4a' });
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(recorder.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('recorded');
    expect(result.current.seconds).toBe(5);
    expect(result.current.uri).toBe('file:///voice.m4a');
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('floors a near-zero recording to 1 second minimum', async () => {
    const recorder = makeRecorder({ currentTime: 0.1, uri: 'file:///voice.m4a' });
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.seconds).toBe(1);
  });

  it('auto-stops once durationMillis reaches the 15s cap', async () => {
    const recorder = makeRecorder({ currentTime: 15, uri: 'file:///voice.m4a' });
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result, rerender } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      mockedUseAudioRecorderState.mockReturnValue(stateFor({ durationMillis: 15_000 }));
      await rerender({});
    });

    expect(recorder.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('recorded');
  });

  it('respects a custom maxSeconds cap', async () => {
    const recorder = makeRecorder({ currentTime: 3, uri: 'file:///voice.m4a' });
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result, rerender } = await renderHook(() => useVoiceRecorder({ maxSeconds: 3 }));
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      mockedUseAudioRecorderState.mockReturnValue(stateFor({ durationMillis: 3_000 }));
      await rerender({});
    });

    expect(recorder.stop).toHaveBeenCalled();
  });

  it('calling start() twice synchronously results in exactly one record() call', async () => {
    const recorder = makeRecorder();
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(mockedRequestPermissions).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('recording');
  });

  it('calling start() while already recording is a no-op', async () => {
    const recorder = makeRecorder();
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(mockedRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('reset() clears status, bars, uri, seconds and error', async () => {
    const recorder = makeRecorder({ currentTime: 5, uri: 'file:///voice.m4a' });
    mockedUseAudioRecorder.mockReturnValue(recorder);
    mockedUseAudioRecorderState.mockReturnValue(stateFor());

    const { result } = await renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    await act(async () => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.bars).toEqual([]);
    expect(result.current.uri).toBeNull();
    expect(result.current.seconds).toBe(0);
    expect(result.current.error).toBeNull();
  });
});
