import { showInterstitial } from '@/native/ads/ads';
import { useIsPro } from '@/features/subscription/api/queries';
/**
 * Behaviour behind the trip-detail ellipsis — port of the `Menu` actions, alerts and sheets of
 * `ios/OnePlan/OnePlan/View/Trip/TripDetailView.swift:766-918` (+ `handleTripDatesConfirmed`
 * :1167-1189 and `startTripIfPossible` :1602-1639).
 *
 * Lives next to the presentational `TripMenuButton` rather than in the route file so the screen
 * stays a layout: it owns the four sheets, the confirm alerts and the mutations, and wraps the
 * header trigger (`children`) in the native menu.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { keys } from '@/api/keys';
import { ApiMutationError, mutationErrorMessage } from '@/api/mutationError';
import type { components } from '@/api/schema';
import {
  invalidateTrip,
  invalidateTripLists,
  useDeletePlanItem,
  useDeleteTrip,
  useUpdateTrip,
} from '@/features/trip/api/mutations';
import { usePlanItems } from '@/features/trip/api/queries';
import { dayCount, toDateOnly } from '@/features/trip/helpers/dateRange';
import { lostPlanItems } from '@/features/trip/helpers/scheduleGuard';
import {
  canEditHomeCurrency,
  needsConversionConfirm,
  startTripBody,
  tripDatesLabel,
  tripMenuItems,
  type TripMenuItemId,
} from '@/features/trip/helpers/tripMenu';
import { useTripBudgets, useTripCore, useTripExpenses } from '@/features/trip/TripDetailContext';
import { useRequestTripEnd } from '@/features/vault/api/endTrip';
import { useTripHasVault } from '@/features/vault/api/tripHasVault';
import {
  alertVaultNotEmpty,
  isVaultNotEmptyError,
  vaultBlocksDelete,
} from '@/features/vault/deleteGuard';
import { openConsensusScreen } from '@/features/vault/useTripEndConsensus';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { useAppLanguage } from '@/i18n';
import { currencyFromCode } from '@/lib/currency';

import {
  CurrencyPickerSheet,
  type CurrencyPickerCode,
  type CurrencyPickerSheetRef,
} from './CurrencyPickerSheet';
import { StartTripSheet, type StartTripSheetRef } from './StartTripSheet';
import { TripDatesSheet, type TripDatesSheetRef } from './TripDatesSheet';
import { TripMenuButton } from './TripMenuButton';

type StartTripConflictErrorDto = components['schemas']['StartTripConflictErrorDto'];

export interface TripMenuControllerProps {
  /** Current user id — creator-only rows gate on it (`TripDetailView.isCreator`). */
  currentUserId: number | undefined;
  /** Presents the leave-group settlement sheet; the menu only routes the tap. */
  onLeave: () => void;
  /** The ellipsis trigger — a plain (non-pressable) view; the native menu handles the tap. */
  children: ReactNode;
  testID?: string;
  /** Injection point for tests, forwarded to the date pickers; defaults to `new Date()`. */
  today?: Date;
}

/** `400 MEMBER_CONFLICT` carries the blocking members (`startTripIfPossible` :1622-1633). */
function memberConflictNames(error: unknown): string[] | null {
  if (!(error instanceof ApiMutationError) || error.status !== 400) return null;
  const body = error.body as Partial<StartTripConflictErrorDto> | null;
  const names = body?.memberNames;
  return Array.isArray(names) && names.length > 0 ? names : null;
}

export function TripMenuController({
  currentUserId,
  onLeave,
  children,
  testID,
  today,
}: TripMenuControllerProps) {
  const isPro = useIsPro();
  const language = useAppLanguage();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { trip, tripId } = useTripCore();
  const budgets = useTripBudgets();
  const { expenses } = useTripExpenses();
  const planItems = usePlanItems(tripId);
  const updateTrip = useUpdateTrip(tripId);
  const deleteTrip = useDeleteTrip();
  // Batched below in `applyDates`, which invalidates once after the loop.
  const deletePlanItem = useDeletePlanItem(tripId, { skipInvalidate: true });
  const web3Enabled = useWeb3Enabled(tripId);
  const hasVault = useTripHasVault(tripId, { enabled: web3Enabled });
  const requestTripEnd = useRequestTripEnd(tripId);

  const groupCurrencyRef = useRef<CurrencyPickerSheetRef>(null);
  const localCurrencyRef = useRef<CurrencyPickerSheetRef>(null);
  const datesRef = useRef<TripDatesSheetRef>(null);
  const startTripRef = useRef<StartTripSheetRef>(null);

  const groupCurrency = (trip?.currency ?? null) as CurrencyPickerCode | null;
  const localCurrency = (trip?.localCurrencies?.[0] ?? null) as CurrencyPickerCode | null;
  const canEditCurrency = canEditHomeCurrency(trip?.status);
  const isScheduled = Boolean(trip?.startDate && trip?.endDate);

  const items = tripMenuItems({
    isCreator: trip != null && currentUserId != null && trip.createdById === currentUserId,
    status: trip?.status,
    homeSymbol: currencyFromCode(trip?.currency)?.symbol ?? null,
    localSymbol: currencyFromCode(localCurrency)?.symbol ?? null,
    datesLabel: tripDatesLabel(trip?.startDate, trip?.endDate, language, t),
    canEditHomeCurrency: canEditCurrency,
    t,
  });

  // --- currency ----------------------------------------------------------

  const commitGroupCurrency = (code: CurrencyPickerCode | null) => {
    if (!code || code === groupCurrency) return;
    const apply = () => {
      updateTrip.mutate(
        { currency: code },
        {
          onError: (err) => Alert.alert(mutationErrorMessage(err, t('Failed to update currency'))),
        },
      );
    };
    if (!needsConversionConfirm(budgets, expenses)) {
      apply();
      return;
    }
    Alert.alert(
      t('Convert to %@?', { 0: code }),
      t(
        "All budgets and expenses — including settled amounts — will be converted at today's exchange rate.",
      ),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Convert'), onPress: apply },
      ],
    );
  };

  const commitLocalCurrency = (code: CurrencyPickerCode | null) => {
    if (code === localCurrency) return;
    updateTrip.mutate(
      { localCurrencies: code ? [code] : [] },
      {
        onError: (err) => Alert.alert(mutationErrorMessage(err, t('Failed to update currency'))),
      },
    );
  };

  // --- schedule ----------------------------------------------------------

  /**
   * Saves the new schedule, THEN removes the plan items the shrink orphaned.
   *
   * Order matters: deleting first would make a mid-loop failure destructive *and* pointless —
   * some plans gone, dates never saved, nothing to show for it. Saving first means the worst
   * case is "dates applied, a few stale plans left behind", which the user can retry. The two
   * failures therefore get different messages.
   */
  const applyDates = async (start: Date, end: Date, lost: readonly { id: number }[]) => {
    try {
      await updateTrip.mutateAsync({ startDate: toDateOnly(start), endDate: toDateOnly(end) });
    } catch (err) {
      Alert.alert(mutationErrorMessage(err, t('Failed to update trip dates')));
      return;
    }

    const removals = await Promise.allSettled(
      lost.map((item) => deletePlanItem.mutateAsync(item.id)),
    );
    const removalFailed = removals.some((r) => r.status === 'rejected');

    // One invalidation for the whole batch (the mutation runs with `skipInvalidate`):
    // `keys.trips.planItems(id)` is nested under `keys.trips.detail(id)`, so this single call
    // clears detail + plan items + the trips list.
    await invalidateTrip(queryClient, tripId);

    if (removalFailed) {
      Alert.alert(t('Trip dates saved, but some plans could not be removed.'));
    }
  };

  const handleDatesConfirmed = ({ start, end }: { start: Date; end: Date }) => {
    const lost = lostPlanItems(planItems.data, dayCount(start, end));
    if (lost.length === 0) {
      void applyDates(start, end, lost);
      return;
    }
    Alert.alert(
      t('Removing days will delete %lld plans', { count: lost.length }),
      t('Plans on trailing days will be permanently removed.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => void applyDates(start, end, lost),
        },
      ],
    );
  };

  // --- start / end / delete ---------------------------------------------

  /** `range === null` ⇒ the trip already carries both dates, so only the status is sent. */
  const runStartTrip = async (range: { start: Date; end: Date } | null) => {
    try {
      await updateTrip.mutateAsync(startTripBody(range, range === null));
      startTripRef.current?.dismiss();
      await invalidateTrip(queryClient, tripId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      startTripRef.current?.dismiss();
      const names = memberConflictNames(err);
      if (!names) {
        Alert.alert(mutationErrorMessage(err, t('Failed to start trip')));
        return;
      }
      const joined = names.join(', ');
      Alert.alert(
        names.length === 1
          ? t(
              '%@ is currently on another trip. They need to end or leave that trip before you can start this one.',
              { 0: joined },
            )
          : t(
              '%@ are currently on other trips. They need to end or leave their trips before you can start this one.',
              { 0: joined },
            ),
      );
    }
  };

  // Vault trips end via off-chain Approve/Deny consensus, not a direct status flip — every member
  // (starting with the creator, here) reviews the ledger before the trip actually ends. Classic
  // trips are unaffected: with the web3 flag off, or a non-vault trip, this is the plain PATCH.
  const endVaultTrip = () => {
    requestTripEnd.mutate(undefined, {
      // An already-pending request (409 recovery) may have my vote: Waiting, not Review.
      onSuccess: (request) => openConsensusScreen(tripId, request),
      onError: (err) => Alert.alert(mutationErrorMessage(err, t('Failed to end trip'))),
    });
  };

  const endClassicTrip = () => {
    updateTrip.mutate(
      { status: 'ENDED' },
      {
        onSuccess: async () => {
          void invalidateTrip(queryClient, tripId);
          // Ending may complete trip_settled (all shares already settled).
          void queryClient.invalidateQueries({ queryKey: keys.missions });
          await showInterstitial('endTrip', isPro).catch(() => undefined);
          router.replace({
            pathname: '/trip/[tripId]/end',
            params: { tripId: String(tripId), mode: 'flow' },
          });
        },
        onError: (err) => Alert.alert(mutationErrorMessage(err, t('Failed to end trip'))),
      },
    );
  };

  const confirmEndTrip = () => {
    // A vault trip must end through consensus, a classic trip through the plain PATCH — deciding
    // before the vault-existence check resolves risks picking the wrong one (iOS never decides
    // with an unknown vault state either, `TripDetailView.swift:1309`). This check is normally
    // already settled well before the user opens the menu and taps this, so it's a rare race.
    if (web3Enabled && hasVault.isLoading) {
      Alert.alert(t('Please try again'));
      return;
    }
    Alert.alert(
      t('End trip?'),
      t('This will end the trip for all members. This action cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('End trip'),
          style: 'destructive',
          onPress: web3Enabled && hasVault.hasVault ? endVaultTrip : endClassicTrip,
        },
      ],
    );
  };

  const confirmDeleteTrip = async () => {
    if (web3Enabled && (await vaultBlocksDelete(queryClient, tripId))) {
      alertVaultNotEmpty(t);
      return;
    }
    Alert.alert(
      t('Delete trip?'),
      t('This will permanently delete the trip for all members. This action cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            deleteTrip.mutate(tripId, {
              onSuccess: () => {
                void invalidateTripLists(queryClient);
                router.dismissTo('/(tabs)/home');
              },
              onError: (err) =>
                isVaultNotEmptyError(err)
                  ? alertVaultNotEmpty(t)
                  : Alert.alert(mutationErrorMessage(err, t('Failed to delete trip'))),
            });
          },
        },
      ],
    );
  };

  const handleSelect = (id: TripMenuItemId) => {
    switch (id) {
      case 'groupCurrency':
        if (!canEditCurrency) {
          Alert.alert(t("Currency can't be changed after the trip has ended."));
          return;
        }
        groupCurrencyRef.current?.present();
        return;
      case 'localCurrency':
        localCurrencyRef.current?.present();
        return;
      case 'tripDates':
        datesRef.current?.present();
        return;
      case 'startTrip':
        // Already scheduled ⇒ flip the status alone so the server keeps the stored dates.
        if (isScheduled) void runStartTrip(null);
        else startTripRef.current?.present();
        return;
      case 'endTrip':
        confirmEndTrip();
        return;
      case 'deleteTrip':
        void confirmDeleteTrip();
        return;
      case 'leaveGroup':
        onLeave();
    }
  };

  return (
    <>
      <TripMenuButton items={items} onSelect={handleSelect} testID={testID}>
        {children}
      </TripMenuButton>
      <CurrencyPickerSheet
        ref={groupCurrencyRef}
        selected={groupCurrency}
        onConfirm={commitGroupCurrency}
        testIDPrefix="group-currency"
      />
      <CurrencyPickerSheet
        ref={localCurrencyRef}
        selected={localCurrency}
        showsNoneOption
        onConfirm={commitLocalCurrency}
        testIDPrefix="local-currency"
      />
      <TripDatesSheet
        ref={datesRef}
        startDate={trip?.startDate}
        endDate={trip?.endDate}
        onConfirm={handleDatesConfirmed}
        today={today}
      />
      <StartTripSheet
        ref={startTripRef}
        startDate={trip?.startDate}
        endDate={trip?.endDate}
        coverImageUrl={trip?.coverImageUrl}
        submitting={updateTrip.isPending}
        onStart={(range) => void runStartTrip(range)}
        today={today}
      />
    </>
  );
}
