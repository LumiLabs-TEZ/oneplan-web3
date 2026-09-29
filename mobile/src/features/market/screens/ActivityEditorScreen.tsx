/**
 * Market plan-item editor — port of `CreateMarketPlanView.swift`: "Plan name" header, fixed day
 * chips, Time / Location rows, Message card, Photos card and a pinned "Save plan" button. Edits a
 * local copy and hands it back to the listing editor through `useActivityDraft`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter, useFocusEffect } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { locationPickStore } from '@/features/location/locationPickStore';
import { PhotosSection } from '@/features/plan/components/PhotosSection';
import { TimeRow } from '@/features/plan/components/TimeRow';
import { parseHourMinute } from '@/features/plan/helpers/planDays';
import { useAppLanguage } from '@/i18n';
import { Button, GlassIconButton, NumericText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { MarketTopGlow } from '../components/MarketTopGlow';
import { useActivityDraft } from '../editor/activityDraft';
import type { Activity } from '../editor/state';
export default function ActivityEditorScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const original = useActivityDraft((s) => s.original);
  const dayCount = useActivityDraft((s) => s.dayCount);
  const isNew = useActivityDraft((s) => s.isNew);
  const [activity, setActivity] = useState<Activity | null>(original);
  const committed = useRef(false);
  const awaitingLocation = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!awaitingLocation.current) return;
      awaitingLocation.current = false;
      const pick = locationPickStore.consume();
      if (pick)
        setActivity((current) =>
          current
            ? {
                ...current,
                location: pick.name,
                latitude: pick.latitude,
                longitude: pick.longitude,
                address: pick.address ?? undefined,
              }
            : current,
        );
    }, []),
  );
  usePreventRemove(JSON.stringify(activity) !== JSON.stringify(original), ({ data }) => {
    if (committed.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(t('Discard changes?'), t('Your unsaved changes will be lost.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Discard'), style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  function save() {
    if (!activity?.title.trim()) return;
    committed.current = true;
    useActivityDraft.getState().finish({ kind: 'save', activity });
    router.back();
  }
  function remove() {
    if (!activity) return;
    Alert.alert(
      t('Delete this plan?'),
      t('Are you sure you want to delete "%@"?', { 0: activity.title }),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            committed.current = true;
            useActivityDraft.getState().finish({ kind: 'delete', key: activity.key });
            router.back();
          },
        },
      ],
    );
  }
  const time = parseHourMinute(activity?.startTime) ?? DEFAULT_TIME;
  const images = activity?.imageUrls ?? [];
  const canSave = !!activity?.title.trim();
  return (
    <View style={styles.screen}>
      <MarketTopGlow />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activity ? (
          <>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: insets.top + HEADER_BUTTON }}
            >
              <View style={styles.header}>
                <Text style={styles.headerLabel}>{t('Plan name')}</Text>
                <TextInput
                  style={styles.nameInput}
                  testID="market-activity-title"
                  placeholder={t('Enter name')}
                  placeholderTextColor={colors.contentL}
                  textAlign="center"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  maxLength={255}
                  value={activity.title}
                  onChangeText={(title) => setActivity({ ...activity, title })}
                />
              </View>
              <View style={styles.form}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.days}
                >
                  {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => {
                    const selected = Math.min(activity.dayNumber, dayCount) === day;
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        testID={`market-activity-day-${day}`}
                        onPress={() => setActivity({ ...activity, dayNumber: day })}
                        style={[styles.day, selected && styles.daySelected]}
                      >
                        <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                          {t('Day %lld', { 0: day })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <TimeRow
                  hour={time.hour}
                  minute={time.minute}
                  testID="market-activity-time"
                  onChange={({ hour, minute }) =>
                    setActivity({
                      ...activity,
                      startTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                    })
                  }
                />
                <Pressable
                  accessibilityRole="button"
                  testID="market-activity-location"
                  style={styles.locationRow}
                  onPress={() => {
                    locationPickStore.consume();
                    awaitingLocation.current = true;
                    router.push('/market/editor/location');
                  }}
                >
                  <Text style={styles.rowLabel}>{t('Location')}</Text>
                  <View style={styles.locationValue}>
                    <Text
                      style={[styles.rowValue, !activity.location && styles.rowPlaceholder]}
                      numberOfLines={1}
                    >
                      {activity.location || t('Choose')}
                    </Text>
                    {activity.location ? (
                      <Pressable
                        accessibilityLabel={t('Remove')}
                        testID="market-activity-location-clear"
                        onPress={() =>
                          setActivity({
                            ...activity,
                            location: undefined,
                            latitude: undefined,
                            longitude: undefined,
                            address: undefined,
                          })
                        }
                      >
                        <Ionicons name="close-circle" size={18} color={colors.contentL} />
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
                <View style={styles.messageCard}>
                  <Text style={styles.rowLabel}>{t('Message')}</Text>
                  <TextInput
                    style={styles.messageInput}
                    testID="market-activity-message"
                    placeholder={t('Description')}
                    placeholderTextColor={colors.contentL}
                    multiline
                    maxLength={MESSAGE_MAX}
                    value={activity.description ?? ''}
                    onChangeText={(description) => setActivity({ ...activity, description })}
                  />
                  <NumericText
                    value={activity.description?.length ?? 0}
                    suffix={`/${MESSAGE_MAX}`}
                    style={styles.counter}
                  />
                </View>
                <PhotosSection
                  existingImageUrls={images}
                  newImageUris={[]}
                  remainingSlots={MAX_IMAGES - images.length}
                  onAddImages={(uris) =>
                    setActivity({
                      ...activity,
                      imageUrls: [...images, ...uris].slice(0, MAX_IMAGES),
                    })
                  }
                  onRemoveExisting={(index) =>
                    setActivity({ ...activity, imageUrls: images.filter((_, i) => i !== index) })
                  }
                  onRemoveNew={() => undefined}
                />
              </View>
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <Button
                title={t('Save plan')}
                testID="market-activity-save"
                disabled={!canSave}
                style={!canSave && styles.saveDisabled}
                onPress={save}
              />
            </View>
          </>
        ) : null}
      </KeyboardAvoidingView>
      <View style={[styles.toolbar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <GlassIconButton
          label={t('Back')}
          icon="chevron-back"
          testID="market-activity-back"
          onPress={() => router.back()}
        />
        {activity && !isNew ? (
          <GlassIconButton label={t('Delete')} testID="market-activity-delete" onPress={remove}>
            <Ionicons name="trash-outline" size={20} color={colors.warning500} />
          </GlassIconButton>
        ) : null}
      </View>
    </View>
  );
}

const HEADER_BUTTON = 45;
const DEFAULT_TIME = { hour: 8, minute: 0 };
/** `CreateMarketPlanView.maxMessageCount`. */
const MESSAGE_MAX = 200;
const MAX_IMAGES = 5;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  toolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  // `planNameSection`: 14pt label over a centered 36pt field, 20pt vertical padding.
  header: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  headerLabel: { ...beVietnamPro(14), color: colors.contentB },
  nameInput: { ...beVietnamPro(36), color: colors.contentB, minWidth: 200, alignSelf: 'stretch' },
  // `formSection`: VStack(spacing: 4), 12pt horizontal padding.
  form: { paddingHorizontal: 12, paddingBottom: 16, gap: 4 },
  days: { gap: 4 },
  day: {
    width: 80,
    height: 35,
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  daySelected: { backgroundColor: colors.blueBase },
  dayText: { ...beVietnamPro(14), color: colors.contentB },
  dayTextSelected: { color: colors.white },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  locationValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rowLabel: { ...beVietnamPro(14), color: colors.contentM },
  rowValue: { ...beVietnamPro(16), color: colors.contentB, flexShrink: 1 },
  rowPlaceholder: { ...beVietnamPro(16, 'light'), color: colors.contentL },
  messageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  messageInput: {
    ...beVietnamPro(14),
    color: colors.contentB,
    height: 95,
    padding: 0,
    textAlignVertical: 'top',
  },
  counter: { ...beVietnamPro(14), color: colors.contentL, textAlign: 'right' },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.background },
  saveDisabled: { opacity: 0.5 },
});
