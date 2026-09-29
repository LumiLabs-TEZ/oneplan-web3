import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLanguage } from '@/i18n';
import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { requireOnline } from '@/offline/guardOnline';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { PinRow } from './PinRow';
import Stars from '@/assets/images/board/processPinStars.svg';
import type { LocationSearchResultDto } from '@/features/location/api/queries';
import { generateTrip, updateBoard } from '../api/mutations';
import type { Board, TripVibe } from '../types';
import { pinsFarApart, suggestedDays } from '../helpers/schedule';
import { BoardButton, BoardSheet, styles } from './common';
import { DestinationField, destinationIds, fieldLabel } from './DestinationField';
import { TripVibeSheet } from './TripVibeSheet';
const LOADING_MESSAGES = [
  'Arranging your pins by area…',
  'Planning your days…',
  'Setting start times…',
  'Almost there…',
];
export function GenerateTripSheet({
  board,
  onClose,
  onGenerated,
  asksForVibe = true,
}: {
  board: Board;
  onClose: () => void;
  onGenerated: (id: number) => void;
  /**
   * Board pins come from many videos, so the user curates them with a vibe (second sheet). Pins
   * from ONE extraction replicate that video's itinerary — skip the vibe step (Swift `asksForVibe`).
   */
  asksForVibe?: boolean;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState(board.title);
  const [selected, setSelected] = useState<number[]>([]);
  const [days, setDays] = useState(1);
  const [touched, setTouched] = useState(false);
  const fillGaps = false;
  const [location, setLocation] = useState<LocationSearchResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [vibes, setVibes] = useState<TripVibe[]>([]);
  const [vibeOpen, setVibeOpen] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const loadingMessages = vibes.length
    ? ['Picking the pins that match your vibe…', ...LOADING_MESSAGES]
    : LOADING_MESSAGES;
  const messageCount = loadingMessages.length;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setMessageIndex((index) => (index + 1) % messageCount), 2200);
    return () => clearInterval(timer);
  }, [busy, messageCount]);
  const [error, setError] = useState('');
  const needsLocation = !board.countryId && !board.cityId && !board.stateId;
  const pins = board.pins.filter((pin) => selected.includes(pin.id));
  const canGenerate = Boolean(selected.length && name.trim() && (!needsLocation || location));
  const submit = async (chosenVibes: TripVibe[]) => {
    if (busy || !canGenerate || !requireOnline(t)) return;
    setMessageIndex(0);
    setBusy(true);
    setError('');
    try {
      if (location) await updateBoard(board.id, destinationIds(location));
      const trip = await generateTrip(board.id, {
        tripName: name.trim(),
        pinIds: selected,
        dayCount: days,
        fillGaps,
        ...(chosenVibes.length ? { vibes: chosenVibes } : {}),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.board.all }),
        client.invalidateQueries({ queryKey: keys.trips.all }),
      ]);
      onGenerated(trip.id);
      onClose();
    } catch (e) {
      setError(mutationErrorMessage(e, t('Something went wrong')));
    } finally {
      setBusy(false);
    }
  };
  const changeSelection = (next: number[]) => {
    setSelected(next);
    setDays((value) =>
      Math.min(
        Math.max(1, Math.min(14, next.length)),
        touched ? value : suggestedDays(next.length),
      ),
    );
  };
  const maxDays = Math.max(1, Math.min(14, selected.length));
  return (
    <>
      <BoardSheet
        title={t('Generate a trip')}
        height="large"
        locked={busy}
        onClose={onClose}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            <BoardButton
              testID="generate-trip-submit"
              title={t('Generate trip')}
              loading={busy}
              disabled={!canGenerate}
              onPress={() => {
                if (!canGenerate) return;
                if (asksForVibe) setVibeOpen(true);
                else void submit([]);
              }}
            />
          </View>
        }
      >
        <Text
          style={[
            styles.muted,
            { letterSpacing: -0.65, textAlign: 'center', marginTop: -12, marginBottom: 2 },
          ]}
        >
          {t(
            asksForVibe
              ? "Pick your pins and days — next you'll choose a vibe."
              : "We'll follow the video's plan — its days and times are kept.",
          )}
        </Text>
        <View
          style={{ paddingHorizontal: 6, gap: 22, opacity: busy ? 0.3 : 1 }}
          pointerEvents={busy ? 'none' : 'auto'}
        >
          <View style={{ gap: 8 }}>
            <Text style={fieldLabel}>{t('Trip name')}</Text>
            <BottomSheetTextInput
              testID="generate-trip-name"
              autoCorrect={false}
              style={{
                ...beVietnamPro(16),
                letterSpacing: -0.32,
                color: colors.contentB,
                backgroundColor: 'white',
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
              value={name}
              onChangeText={setName}
              maxLength={120}
              placeholder={t('Trip name')}
            />
          </View>
          {needsLocation ? (
            <DestinationField value={location} onChange={setLocation} variant="field" />
          ) : null}
          <View style={{ gap: 8 }}>
            <Text style={fieldLabel}>{t('Trip length')}</Text>
            <View
              style={[
                styles.row,
                {
                  gap: 12,
                  backgroundColor: 'white',
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                },
              ]}
            >
              <Text
                style={{
                  ...beVietnamPro(16, 'medium'),
                  letterSpacing: -0.32,
                  color: colors.contentB,
                  flex: 1,
                }}
              >
                {t('%lld days', { count: days })}
              </Text>
              <StepperButton
                icon="remove"
                label={t('Remove a day')}
                enabled={days > 1}
                onPress={() => {
                  setDays(days - 1);
                  setTouched(true);
                }}
              />
              <StepperButton
                icon="add"
                label={t('Add a day')}
                enabled={days < maxDays}
                onPress={() => {
                  setDays(days + 1);
                  setTouched(true);
                }}
              />
            </View>
          </View>
          {pinsFarApart(pins) ? (
            <View style={[styles.card, { backgroundColor: '#FFF0E5' }]}>
              <Text style={styles.error}>
                {t('These pins are far apart. Consider planning separate trips.')}
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 10 }}>
            <View style={[styles.row, { gap: 10 }]}>
              <Text style={[fieldLabel, { flex: 1 }]}>{t('Places')}</Text>
              <Text style={styles.muted}>
                {t('%lld of %lld selected', { 0: selected.length, 1: board.pins.length })}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  changeSelection(
                    selected.length === board.pins.length ? [] : board.pins.map((p) => p.id),
                  )
                }
              >
                <Text style={{ ...beVietnamPro(13, 'medium'), color: colors.blueBase }}>
                  {t(selected.length === board.pins.length ? 'Deselect all' : 'Select all')}
                </Text>
              </Pressable>
            </View>
            {board.pins.map((pin, index) => (
              <PinRow
                key={pin.id}
                testID={`generate-trip-pin-${index}`}
                pin={pin}
                selected={selected.includes(pin.id)}
                onPress={() =>
                  changeSelection(
                    selected.includes(pin.id)
                      ? selected.filter((id) => id !== pin.id)
                      : [...selected, pin.id],
                  )
                }
              />
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        {busy ? (
          <View
            style={{
              position: 'absolute',
              top: 140,
              alignSelf: 'center',
              backgroundColor: 'white',
              borderRadius: 24,
              padding: 24,
              gap: 16,
              alignItems: 'center',
              boxShadow: '0px 4px 30px #00000020',
            }}
          >
            <Stars width={40} height={40} />
            <Text style={styles.title}>{t('Generating your trip…')}</Text>
            <Text style={styles.muted}>{t(loadingMessages[messageIndex % messageCount]!)}</Text>
            <ActivityIndicator color={colors.blueBase} />
          </View>
        ) : null}
      </BoardSheet>
      {vibeOpen ? (
        <TripVibeSheet
          selected={vibes}
          onClose={() => setVibeOpen(false)}
          onConfirm={(chosen) => {
            setVibes(chosen);
            setVibeOpen(false);
            void submit(chosen);
          }}
        />
      ) : null}
    </>
  );
}

/** 32pt round +/− (`stepperButton` in `GenerateTripBottomSheet.swift`). */
function StepperButton({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: enabled ? colors.blueBase : colors.neutral100,
      }}
    >
      <Ionicons name={icon} size={18} color={enabled ? colors.white : colors.contentL} />
    </Pressable>
  );
}
