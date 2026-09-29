import { t } from 'i18next';
import { ActionSheetIOS, Alert } from 'react-native';

import { initI18n } from '@/i18n';

import { presentMemberRoleMenu } from './memberRoleMenu';

beforeAll(() => {
  initI18n();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('presentMemberRoleMenu', () => {
  it('iOS, no vault leave row: role option at index 0, cancel at 1', () => {
    const onSelectRole = jest.fn();
    const spy = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0));

    presentMemberRoleMenu(t, 'Ken', { roleActionTitle: 'Make co-host', onSelectRole }, 'ios');

    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      title: 'Ken',
      message: 'A co-host can approve payments over the trip limit.',
      options: ['Make co-host', 'Cancel'],
      cancelButtonIndex: 1,
    });
    expect(onSelectRole).toHaveBeenCalledTimes(1);
  });

  it('iOS, with vault leave row: clear action at index 1, cancel pushed to 2', () => {
    const onSelectRole = jest.fn();
    const onSelectClearVaultLeave = jest.fn();
    const spy = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(1));

    presentMemberRoleMenu(
      t,
      'Ken',
      {
        roleActionTitle: 'Remove as co-host',
        onSelectRole,
        clearVaultLeaveTitle: 'Confirm leave',
        onSelectClearVaultLeave,
      },
      'ios',
    );

    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      options: ['Remove as co-host', 'Confirm leave', 'Cancel'],
      cancelButtonIndex: 2,
    });
    expect(onSelectClearVaultLeave).toHaveBeenCalledTimes(1);
    expect(onSelectRole).not.toHaveBeenCalled();
  });

  it('iOS: cancel index calls neither handler', () => {
    const onSelectRole = jest.fn();
    const onSelectClearVaultLeave = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(2));

    presentMemberRoleMenu(
      t,
      'Ken',
      {
        roleActionTitle: 'Remove as co-host',
        onSelectRole,
        clearVaultLeaveTitle: 'Confirm leave',
        onSelectClearVaultLeave,
      },
      'ios',
    );

    expect(onSelectRole).not.toHaveBeenCalled();
    expect(onSelectClearVaultLeave).not.toHaveBeenCalled();
  });

  it('Android: shows an Alert with the role button and (when present) the clear button', () => {
    const onSelectRole = jest.fn();
    const onSelectClearVaultLeave = jest.fn();
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b) => b.text === 'Mark paid for leave')?.onPress?.();
    });

    presentMemberRoleMenu(
      t,
      'Ken',
      {
        roleActionTitle: 'Make co-host',
        onSelectRole,
        clearVaultLeaveTitle: 'Mark paid for leave',
        onSelectClearVaultLeave,
      },
      'android',
    );

    expect(spy).toHaveBeenCalled();
    expect(onSelectClearVaultLeave).toHaveBeenCalledTimes(1);
    expect(onSelectRole).not.toHaveBeenCalled();
  });

  it('Android, no vault leave row: only role + cancel buttons are offered', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    presentMemberRoleMenu(t, 'Ken', { roleActionTitle: 'Make co-host', onSelectRole: jest.fn() }, 'android');

    const buttons = spy.mock.calls[0]?.[2];
    expect(buttons?.map((b) => b.text)).toEqual(['Make co-host', 'Cancel']);
  });
});
