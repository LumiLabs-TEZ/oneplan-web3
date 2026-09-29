import { t } from 'i18next';
import { ActionSheetIOS, Alert, Linking } from 'react-native';

import { initI18n } from '@/i18n';

import { mapsChoices, openDirections, presentMapsChooser } from './openInMaps';

beforeAll(() => {
  initI18n();
});

// `Linking`'s methods aren't plain own-properties `jest.restoreAllMocks()` can undo (a native
// module getter), so a spy's call history survives across `it`s unless explicitly cleared —
// clear before each test rather than relying on restore.
afterEach(() => {
  jest.clearAllMocks();
});

describe('mapsChoices', () => {
  it('offers Apple and Google Maps on iOS', () => {
    expect(mapsChoices('ios')).toEqual(['apple', 'google']);
  });

  it('offers only Google Maps on Android', () => {
    expect(mapsChoices('android')).toEqual(['google']);
  });
});

describe('presentMapsChooser', () => {
  it('shows an ActionSheetIOS with both maps + cancel, and invokes onChoice for the tapped index', () => {
    const spy = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(1));
    const onChoice = jest.fn();

    presentMapsChooser(t, onChoice, 'ios');

    expect(spy).toHaveBeenCalledTimes(1);
    const [options] = spy.mock.calls[0]!;
    expect(options.options).toEqual(['Apple Maps', 'Google Maps', 'Cancel']);
    expect(options.cancelButtonIndex).toBe(2);
    expect(onChoice).toHaveBeenCalledWith('google');

    spy.mockRestore();
  });

  it('does not call onChoice when the ActionSheetIOS cancel index is tapped', () => {
    const spy = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(2));
    const onChoice = jest.fn();

    presentMapsChooser(t, onChoice, 'ios');

    expect(onChoice).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows a two-button Alert on Android and invokes onChoice for Google Maps', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.[0]?.onPress?.();
    });
    const onChoice = jest.fn();

    presentMapsChooser(t, onChoice, 'android');

    expect(spy).toHaveBeenCalledTimes(1);
    const [, , buttons] = spy.mock.calls[0]!;
    expect(buttons).toHaveLength(2);
    expect(onChoice).toHaveBeenCalledWith('google');

    spy.mockRestore();
  });
});

describe('openDirections', () => {
  const destination = { latitude: 10, longitude: 106 };

  it('opens the Apple Maps URL when it can be opened', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await openDirections({ destination, mode: 'car' }, 'apple', t);

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('maps.apple.com'));
    jest.restoreAllMocks();
  });

  it('opens the Google Maps URL when it can be opened', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await openDirections(
      { destination, mode: 'car', name: 'Cafe', address: '1 Main St' },
      'google',
      t,
    );

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('google.com/maps'));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(`destination=${encodeURIComponent('Cafe, 1 Main St')}`),
    );
    jest.restoreAllMocks();
  });

  it('alerts with a generic error when the URL cannot be opened', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await openDirections({ destination, mode: 'car' }, 'apple', t);

    expect(openSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Something went wrong');
    jest.restoreAllMocks();
  });

  it('alerts with a generic error when Linking.openURL rejects', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('nope'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await openDirections({ destination, mode: 'car' }, 'apple', t);

    expect(alertSpy).toHaveBeenCalledWith('Something went wrong');
    jest.restoreAllMocks();
  });
});
