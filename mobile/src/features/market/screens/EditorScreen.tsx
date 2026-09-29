import { usePreventRemove } from 'expo-router/react-navigation';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError, mutationErrorMessage } from '@/api/mutationError';
import { useTrip, usePlanItems } from '@/features/trip/api/queries';
import { fromTrip } from '../editor/fromTrip';
import {
  CurrencyPickerSheet,
  type CurrencyPickerSheetRef,
} from '@/features/trip/components/CurrencyPickerSheet';
import { LocationPickerScreen } from '@/features/location/components/LocationPickerScreen';
import { useAppLanguage } from '@/i18n';
import { fallbackCurrency, formatWhole } from '@/lib/currency';
import { requireOnline } from '@/offline/guardOnline';
import { AppMenuView, GlassIconButton, GlassIconCircle, Spinner } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useListing, type MarketItem } from '../api/queries';
import { useActivityDraft } from '../editor/activityDraft';
import { MarketThumbnail, tagColors, tagLabels } from '../components/ListingCard';
import { MarketPlanSection } from '../components/MarketPlanSection';
import { MarketState } from '../components/MarketState';
import { MarketTopGlow } from '../components/MarketTopGlow';
import { TagPickerSheet, type TagPickerSheetRef } from '../components/TagPickerSheet';
import {
  editorReducer,
  editorState,
  fromListing,
  isDirty,
  validationErrors,
  type Activity,
} from '../editor/state';
import { newSaveProgress, saveDocument } from '../editor/save';
export default function EditorScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const { id, tripId } = useLocalSearchParams<{ id?: string; tripId?: string }>();
  const router = useRouter();
  const currencySheet = useRef<CurrencyPickerSheetRef>(null);
  const tagSheet = useRef<TagPickerSheetRef>(null);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const client = useQueryClient();
  const listing = useListing(id ?? '', true);
  const sourceTrip = useTrip(tripId ? Number(tripId) : undefined);
  const sourceItems = usePlanItems(tripId ? Number(tripId) : undefined);
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    editorState({
      fields: {
        name: '',
        countryId: 0,
        durationDays: 1,
        price: 0,
        currency: 'VND',
        tags: ['FRIENDS'],
      },
      activities: [],
    }),
  );
  const progress = useRef(newSaveProgress(id ? Number(id) : undefined));
  const loaded = useRef(false);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (deleted && !saving) router.replace('/market/owner');
  }, [deleted, saving, router]);
  const [sessionId] = useState(() => `editor-${Date.now()}`);
  useEffect(() => () => useActivityDraft.getState().clear(sessionId), [sessionId]);
  function openActivity(activity: Activity, isNew = false) {
    useActivityDraft.getState().begin(sessionId, activity, {
      dayCount: state.current.fields.durationDays ?? 1,
      isNew,
    });
    router.push('/market/editor/activity');
  }
  useFocusEffect(
    useCallback(() => {
      const result = useActivityDraft.getState().consume(sessionId);
      if (result?.kind === 'save') dispatch({ type: 'activity', activity: result.activity });
      else if (result?.kind === 'delete') dispatch({ type: 'removeActivity', key: result.key });
    }, [sessionId]),
  );
  const [destination, setDestination] = useState('');
  const [pickingLocation, setPickingLocation] = useState(false);
  useEffect(() => {
    if (listing.data && !loaded.current) {
      loaded.current = true;
      const document = fromListing(listing.data);
      progress.current.savedFields = document.fields;
      for (const activity of document.activities) {
        const body = { ...activity };
        delete (body as Partial<typeof activity>).key;
        delete body.id;
        progress.current.savedItems[activity.key] = JSON.stringify(body);
      }
      dispatch({ type: 'load', document });
    }
  }, [listing.data]);
  useEffect(() => {
    if (!id && sourceTrip.data && sourceItems.data && !loaded.current) {
      loaded.current = true;
      dispatch({ type: 'import', document: fromTrip(sourceTrip.data, sourceItems.data) });
    }
  }, [id, sourceTrip.data, sourceItems.data]);
  usePreventRemove(!deleted && (isDirty(state) || saving), ({ data }) => {
    if (saving) return;
    Alert.alert(t('Discard changes?'), t('Your unsaved changes will be lost.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Discard'),
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });
  async function pick() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (!result.canceled) dispatch({ type: 'cover', uri: result.assets[0]!.uri });
    } catch (error) {
      Alert.alert(t('Error'), mutationErrorMessage(error, t('Something went wrong')));
    }
  }
  async function save(publish: boolean) {
    if (!requireOnline(t) || busy.current) return;
    const errors = validationErrors(state.current, publish);
    if (errors.length) {
      Alert.alert(t('Error'), errors.map((e) => t(e)).join('\n'));
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const existingIds = [
        ...(listing.data?.items.map((item) => item.id) ?? []),
        ...Object.values(progress.current.itemIds),
      ];
      const retained = new Set(
        state.current.activities.map((a) => a.id ?? progress.current.itemIds[a.key]),
      );
      progress.current.deletedIds = existingIds.filter((value) => !retained.has(value));
      await saveDocument(
        state.current,
        progress.current,
        publish && (!listing.data || listing.data.status === 'DRAFT'),
      );
      dispatch({ type: 'saved', document: state.current });
      await client.invalidateQueries({ queryKey: keys.market.all });
      if (publish) router.push('/market/verification');
      else Alert.alert(t('Saved'));
    } catch (error) {
      Alert.alert(t('Error'), mutationErrorMessage(error, t('Something went wrong')));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function deleteListing() {
    if (!progress.current.listingId || !requireOnline(t)) return;
    Alert.alert(t('Delete plan?'), t('This action cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!requireOnline(t) || busy.current) return;
            busy.current = true;
            setSaving(true);
            try {
              const result = await api.DELETE('/marketplace/listings/{id}', {
                params: { path: { id: progress.current.listingId! } },
              });
              if (!result.response.ok)
                throw new ApiMutationError(result.response.status, result.error);
              dispatch({ type: 'saved', document: state.current });
              await client.invalidateQueries({ queryKey: keys.market.all });
              setDeleted(true);
            } catch (error) {
              Alert.alert(t('Error'), mutationErrorMessage(error, t('Something went wrong')));
            } finally {
              busy.current = false;
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }
  if (id && !listing.data)
    return (
      <SafeAreaView style={styles.screen}>
        <MarketState
          loading={listing.isPending}
          error={listing.isError}
          retry={() => {
            void listing.refetch();
          }}
        />
      </SafeAreaView>
    );
  const doc = state.current;
  const tag = doc.fields.tags?.[0] ?? 'FRIENDS';
  const currency = fallbackCurrency(doc.fields.currency);
  const location =
    destination ||
    [
      listing.data?.cityName ?? sourceTrip.data?.location?.cityName,
      listing.data?.stateName ?? sourceTrip.data?.location?.stateName,
      listing.data?.countryName ?? sourceTrip.data?.location?.countryName,
    ]
      .filter(Boolean)
      .join(', ');
  const days = doc.fields.durationDays ?? 1;
  const canSubmit = !!doc.fields.name.trim() && !!doc.fields.countryId;
  // `MarketPlanSection` renders `MarketItem`s; `id` indexes back into `doc.activities`.
  const planItems: MarketItem[] = doc.activities.map((a, index) => ({
    id: index,
    listingId: 0,
    dayNumber: a.dayNumber,
    title: a.title,
    description: a.description ?? null,
    location: a.location ?? null,
    startTime: a.startTime ?? null,
    category: a.category ?? null,
    imageUrls: a.imageUrls ?? [],
    sortOrder: a.sortOrder ?? 0,
    createdAt: '',
  }));
  const submitDisabled = !canSubmit || saving;
  return (
    <View style={styles.screen}>
      <MarketTopGlow />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_BUTTON + 20 }]}
        >
          <View style={styles.hero}>
            <MarketThumbnail
              uri={doc.coverUri ?? doc.fields.coverImageUrl}
              testID="market-cover"
              onPress={() => {
                if (!saving) void pick();
              }}
            />
            <View style={styles.card}>
              <Row label={t('Trip name')}>
                <TextInput
                  style={styles.valueInput}
                  placeholder={t('Trip name')}
                  placeholderTextColor={colors.contentL}
                  value={doc.fields.name}
                  onChangeText={(name) => dispatch({ type: 'fields', fields: { name } })}
                  editable={!saving}
                  testID="market-name"
                />
              </Row>
              <Divider />
              <Row label={t('Duration')}>
                <Text style={styles.value}>{t('%lld days', { count: days })}</Text>
              </Row>
              <Divider />
              <Row
                label={t('Location')}
                testID="market-location"
                onPress={() => setPickingLocation(true)}
              >
                <Text style={[styles.value, styles.valueShrink]} numberOfLines={2}>
                  {location || '—'}
                </Text>
              </Row>
              <Divider />
              <Row label={t('Budget per person')}>
                <TextInput
                  style={styles.valueInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.contentL}
                  testID="market-budget"
                  accessibilityLabel={t('Budget per person')}
                  value={doc.fields.price ? formatWhole(doc.fields.price) : ''}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'fields',
                      fields: { price: Number(text.replace(/\D/g, '').slice(0, 12)) },
                    })
                  }
                  editable={!saving}
                />
              </Row>
              <Divider />
              <Row label={t('Tag')} testID="market-tag" onPress={() => tagSheet.current?.present()}>
                <Text style={[styles.tag, tagColors[tag]]}>{t(tagLabels[tag])}</Text>
              </Row>
              <Divider />
              <Row
                label={t('Currency')}
                testID="market-currency"
                onPress={() => currencySheet.current?.present()}
              >
                <Text style={styles.value}>{`${currency.code} (${currency.symbol})`}</Text>
              </Row>
              <Divider />
              <View style={styles.description}>
                <Text style={styles.label}>{t('Description')}</Text>
                <TextInput
                  style={styles.descriptionInput}
                  placeholder={t('Describe your plan...')}
                  placeholderTextColor={colors.contentL}
                  multiline
                  value={doc.fields.description}
                  onChangeText={(description) =>
                    dispatch({ type: 'fields', fields: { description } })
                  }
                  editable={!saving}
                  testID="market-description"
                />
              </View>
            </View>
          </View>
          <View style={styles.plan}>
            <MarketPlanSection
              items={planItems}
              durationDays={days}
              onItemPress={(item) => {
                const activity = doc.activities[item.id];
                if (activity) openActivity(activity);
              }}
              onAddPlan={(day) =>
                openActivity(
                  {
                    key: `local-${Date.now()}`,
                    dayNumber: day,
                    title: '',
                    sortOrder:
                      Math.max(
                        -1,
                        ...doc.activities
                          .filter((a) => a.dayNumber === day)
                          .map((a) => a.sortOrder ?? 0),
                      ) + 1,
                    imageUrls: [],
                  },
                  true,
                )
              }
              onAddDay={() => dispatch({ type: 'addDay' })}
              canAddDay={days < 30 && !saving}
              onDeleteDay={(day) => dispatch({ type: 'removeDay', day })}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        <GlassIconButton
          label={t('Back')}
          icon="chevron-back"
          testID="market-editor-back"
          disabled={saving}
          onPress={() => router.back()}
        />
        {saving ? (
          <View style={styles.spinner}>
            <Spinner />
          </View>
        ) : (
          <View style={styles.trailing}>
            {id ? (
              <GlassIconButton label={t('Delete')} testID="market-delete" onPress={deleteListing}>
                <Ionicons name="trash-outline" size={20} color={colors.warning500} />
              </GlassIconButton>
            ) : null}
            {!id || !listing.data || listing.data.status === 'DRAFT' ? (
              <View
                style={submitDisabled && styles.disabled}
                pointerEvents={submitDisabled ? 'none' : 'auto'}
              >
                <AppMenuView
                  testID="market-submit-menu"
                  actions={[
                    {
                      id: 'upload',
                      title: t('Upload Plan'),
                      ...(Platform.OS === 'ios'
                        ? { image: 'paperplane', imageColor: MENU_ICON_COLOR }
                        : { androidIcon: 'paper-plane-outline' as const }),
                    },
                    {
                      id: 'draft',
                      title: t('Save as Draft'),
                      ...(Platform.OS === 'ios'
                        ? { image: 'doc', imageColor: MENU_ICON_COLOR }
                        : { androidIcon: 'document-outline' as const }),
                    },
                  ]}
                  onPressAction={({ nativeEvent }) => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void save(nativeEvent.event === 'upload');
                  }}
                >
                  <GlassIconCircle>
                    <Ionicons name="checkmark" size={22} color={colors.blueBase} />
                  </GlassIconCircle>
                </AppMenuView>
              </View>
            ) : (
              <GlassIconButton
                label={t('Save')}
                testID="market-save"
                disabled={submitDisabled}
                onPress={() => {
                  void save(true);
                }}
              >
                <Ionicons name="checkmark" size={22} color={colors.blueBase} />
              </GlassIconButton>
            )}
          </View>
        )}
      </View>
      {/* iOS presents `TripLocationPickerSheet` as a `.fullScreenCover` (`UploadTripFormView.swift:956`). */}
      <Modal
        visible={pickingLocation}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPickingLocation(false)}
      >
        <LocationPickerScreen
          onClose={() => setPickingLocation(false)}
          onSelect={(result) => {
            setPickingLocation(false);
            setDestination(
              [result.city?.name, result.state?.name, result.country.name]
                .filter(Boolean)
                .join(', '),
            );
            dispatch({
              type: 'fields',
              fields: {
                cityId: result.city?.id ?? null,
                stateId: result.state?.id ?? null,
                countryId: result.country.id,
              },
            });
          }}
        />
      </Modal>
      <TagPickerSheet
        ref={tagSheet}
        selected={tag}
        onConfirm={(value) => dispatch({ type: 'fields', fields: { tags: [value] } })}
      />
      <CurrencyPickerSheet
        ref={currencySheet}
        selected={doc.fields.currency ?? 'VND'}
        onConfirm={(value) => {
          if (value) dispatch({ type: 'fields', fields: { currency: value } });
        }}
      />
    </View>
  );
}

/**
 * `UploadTripFormView.editableRow`: label left, value trailing. With `onPress` the whole row is the
 * tap target (picker rows), not just the trailing value.
 */
function Row({
  label,
  children,
  onPress,
  testID,
}: {
  label: string;
  children: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const content = (
    <>
      <Text style={styles.label}>{label}</Text>
      {children}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const HEADER_BUTTON = 45;
/** System `label`; an unset `imageColor` arrives transparent on iOS (see `TripMenuButton`). */
const MENU_ICON_COLOR = '#000000';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  trailing: { flexDirection: 'row', gap: 8 },
  spinner: { width: HEADER_BUTTON, height: HEADER_BUTTON, justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  hero: { alignItems: 'center', gap: 19 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 12,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
  },
  label: { ...beVietnamPro(16), color: colors.contentM, flex: 1 },
  value: { ...beVietnamPro(16, 'medium'), color: colors.contentB, textAlign: 'right' },
  valueShrink: { flexShrink: 1, maxWidth: '65%' },
  rowPressed: { opacity: 0.6 },
  valueInput: {
    ...beVietnamPro(16, 'medium'),
    color: colors.contentB,
    textAlign: 'right',
    flex: 1,
    padding: 0,
  },
  tag: {
    ...beVietnamPro(14),
    lineHeight: 17,
    includeFontPadding: false,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.dividerStroke },
  description: { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  descriptionInput: {
    ...beVietnamPro(16),
    color: colors.contentB,
    padding: 0,
    minHeight: 72,
    maxHeight: 144,
    textAlignVertical: 'top',
  },
  plan: { paddingTop: 20 },
});
