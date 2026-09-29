import { t } from 'i18next';
import { ActionSheetIOS, Alert } from 'react-native';

import { initI18n } from '@/i18n';

import { confirmRemoveFriend, presentFriendProfileMenu } from './removeFriendPrompt';

beforeAll(() => {
  initI18n();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('presentFriendProfileMenu', () => {
  it('iOS: shows an ActionSheetIOS and calls onSelectRemove for index 0', () => {
    const onSelectRemove = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0));

    presentFriendProfileMenu(t, 'Anh', onSelectRemove, 'ios');
    expect(onSelectRemove).toHaveBeenCalledTimes(1);
  });

  it('iOS: the sheet carries the remove title and description', () => {
    const spy = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => undefined);

    presentFriendProfileMenu(t, 'Anh', jest.fn(), 'ios');
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      title: 'Remove friend?',
      message: 'Anh will be removed from your friends list.',
    });
  });

  it('iOS: does not call onSelectRemove for the cancel index', () => {
    const onSelectRemove = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(1));

    presentFriendProfileMenu(t, 'Anh', onSelectRemove, 'ios');
    expect(onSelectRemove).not.toHaveBeenCalled();
  });

  it('Android: shows an Alert with a destructive Remove friend button', () => {
    const onSelectRemove = jest.fn();
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const remove = buttons?.find((b) => b.style === 'destructive');
      remove?.onPress?.();
    });

    presentFriendProfileMenu(t, 'Anh', onSelectRemove, 'android');
    expect(spy).toHaveBeenCalled();
    expect(onSelectRemove).toHaveBeenCalledTimes(1);
  });
});

describe('confirmRemoveFriend', () => {
  it('shows the remove-confirm alert and calls onConfirm on the destructive button', () => {
    const onConfirm = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const remove = buttons?.find((b) => b.style === 'destructive');
      remove?.onPress?.();
    });

    confirmRemoveFriend(t, 'Anh', onConfirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when the cancel button is chosen', () => {
    const onConfirm = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const cancel = buttons?.find((b) => b.style === 'cancel');
      cancel?.onPress?.();
    });

    confirmRemoveFriend(t, 'Anh', onConfirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
