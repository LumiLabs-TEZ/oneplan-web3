import { fireEvent, render, screen } from '@testing-library/react-native';
import { useReducer } from 'react';

import { initI18n } from '@/i18n';
import { Button } from '@/ui/components';

import { PlanForm } from './PlanForm';
import { canSubmit, reduce, seedCreate, type PlanFormState } from '../planForm';
import type { DayContext } from '../helpers/planDays';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

function Harness({ initial }: { initial: PlanFormState }) {
  const [state, dispatch] = useReducer(reduce, initial);
  return (
    <PlanForm
      state={state}
      dispatch={dispatch}
      acceptedMembers={[]}
      days={[1]}
      ctx={ctx}
      onPickLocation={jest.fn()}
      canAddDay={false}
      footer={
        <Button
          title="Save Plan"
          disabled={!canSubmit(state)}
          onPress={jest.fn()}
          testID="plan-save"
        />
      }
    />
  );
}

describe('PlanForm', () => {
  beforeAll(() => {
    initI18n();
  });

  it('disables Save until a name is entered', async () => {
    const initial = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
    await render(<Harness initial={initial} />);

    expect(screen.getByTestId('plan-save').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('plan-name'), 'Beach day');

    expect(screen.getByTestId('plan-save').props.accessibilityState.disabled).toBe(false);
  });

  it('hides the add-photo tile once 5 images are attached', async () => {
    const initial: PlanFormState = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      existingImageUrls: ['a', 'b', 'c'],
      newImageUris: ['d', 'e'],
    };
    await render(<Harness initial={initial} />);

    expect(screen.queryByTestId('plan-photos-add')).toBeNull();
  });

  it('shows the add-photo tile below the 5-image cap', async () => {
    const initial: PlanFormState = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      existingImageUrls: ['a'],
    };
    await render(<Harness initial={initial} />);

    expect(screen.getByTestId('plan-photos-add')).toBeTruthy();
  });

  it('shows a picked location name and clearing it drops the coords', async () => {
    const initial: PlanFormState = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      location: { text: 'Louvre', latitude: 1, longitude: 2, address: 'Rue', category: 'TICKET' },
    };
    await render(<Harness initial={initial} />);

    expect(screen.getByText('Louvre')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('plan-location-clear'));

    expect(screen.getByText('Choose')).toBeTruthy();
    expect(screen.queryByTestId('plan-location-clear')).toBeNull();
  });
});
