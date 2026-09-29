import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';

import { initI18n } from '@/i18n';

import { EditDisplayNameSheet, type EditDisplayNameSheetRef } from './EditDisplayNameSheet';

describe('EditDisplayNameSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('commits the trimmed value on return', async () => {
    const onCommit = jest.fn();
    const ref = createRef<EditDisplayNameSheetRef>();
    const screen = await render(
      <EditDisplayNameSheet ref={ref} initial="Ken" saving={false} onCommit={onCommit} />,
    );
    await act(async () => ref.current?.present());
    await fireEvent.changeText(screen.getByTestId('display-name-input'), '  Ken Nguyen  ');
    await fireEvent(screen.getByTestId('display-name-input'), 'submitEditing');
    expect(onCommit).toHaveBeenCalledWith('Ken Nguyen');
  });

  it('does not commit on return when the value is unchanged', async () => {
    const onCommit = jest.fn();
    const ref = createRef<EditDisplayNameSheetRef>();
    const screen = await render(
      <EditDisplayNameSheet ref={ref} initial="Ken" saving={false} onCommit={onCommit} />,
    );
    await act(async () => ref.current?.present());
    await fireEvent(screen.getByTestId('display-name-input'), 'submitEditing');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits the trimmed value on dismiss', async () => {
    const onCommit = jest.fn();
    const ref = createRef<EditDisplayNameSheetRef>();
    const screen = await render(
      <EditDisplayNameSheet ref={ref} initial="Ken" saving={false} onCommit={onCommit} />,
    );
    await act(async () => ref.current?.present());
    await fireEvent.changeText(screen.getByTestId('display-name-input'), 'Ken Nguyen');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onCommit).toHaveBeenCalledWith('Ken Nguyen');
  });

  it('never commits twice for the same present()', async () => {
    const onCommit = jest.fn();
    const ref = createRef<EditDisplayNameSheetRef>();
    const screen = await render(
      <EditDisplayNameSheet ref={ref} initial="Ken" saving={false} onCommit={onCommit} />,
    );
    await act(async () => ref.current?.present());
    await fireEvent.changeText(screen.getByTestId('display-name-input'), 'Ken Nguyen');
    await fireEvent(screen.getByTestId('display-name-input'), 'submitEditing');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('resets the draft to the new initial value on every present()', async () => {
    const onCommit = jest.fn();
    const ref = createRef<EditDisplayNameSheetRef>();
    const screen = await render(
      <EditDisplayNameSheet ref={ref} initial="Ken" saving={false} onCommit={onCommit} />,
    );
    await act(async () => ref.current?.present());
    await fireEvent.changeText(screen.getByTestId('display-name-input'), 'Someone Else');
    await act(async () => ref.current?.present());
    await fireEvent(screen.getByTestId('display-name-input'), 'submitEditing');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
