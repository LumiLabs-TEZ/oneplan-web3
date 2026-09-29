import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { RewardArt } from './RewardArt';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { Image as InlineImage, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useScanCredits } from '@/features/board/api/queries';
import { useAppLanguage } from '@/i18n';
import { beVietnamPro } from '@/ui/typography';
import { rewardCatalog } from './catalog';
import type { Redemption, Reward } from './api/queries';
import type { ShopRewardId } from './helpers/redemption';
import { NumericText } from '@/ui/components/NumericText';
import { useMissionsTransport } from './api/transport';
import { DashedDivider, MissionAction, SparkChip, styles } from './RewardViews';
export type RedeemItem = Reward & { itemId: ShopRewardId };
export type Success = { item: RedeemItem; quantity: number; result: Redemption };
export function RedeemSheet({
  item,
  balance,
  pending,
  submit,
}: {
  item: RedeemItem;
  balance: number;
  pending: boolean;
  submit: (quantity: number) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const [quantity, setQuantity] = useState(1);
  const copy = rewardCatalog[item.itemId];
  const shortfall = Math.max(0, item.price * quantity - balance);
  const [beforeBolt, afterBolt] = t("Spend the %@ you've earned", { 0: '\uFFFC' }).split('\uFFFC');
  return (
    <BottomSheetScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: 4,
        paddingBottom: 12 + insets.bottom,
        gap: 16,
      }}
    >
      <View
        style={[
          styles.header,
          { paddingHorizontal: 12, paddingRight: 20 },
          largeText && { flexDirection: 'column', alignItems: 'flex-start' },
        ]}
      >
        <RewardArt id={item.itemId} width={45} height={45} />
        <View style={{ flex: largeText ? undefined : 1, gap: 4 }}>
          <Text style={styles.title}>{t(copy.title)}</Text>
          <Text style={styles.label}>
            {beforeBolt}
            <InlineImage
              source={require('../../../assets/images/missions/rewardBolt.png')}
              style={{ width: 9, height: 12 }}
            />
            {afterBolt}
          </Text>
        </View>
        <SparkChip dark insufficient={shortfall > 0}>
          {balance}
        </SparkChip>
      </View>
      <View
        style={{
          flex: 1,
          minHeight: 160,
          flexDirection: 'row',
          width: 231,
          justifyContent: 'space-between',
          alignSelf: 'center',
          alignItems: 'center',
        }}
      >
        {item.itemId === 'scan_credit_1' ? (
          <Pressable
            hitSlop={7}
            accessibilityRole="button"
            accessibilityLabel={t('Decrease')}
            accessibilityState={{ disabled: quantity <= 1 || pending }}
            disabled={quantity <= 1 || pending}
            onPress={() => setQuantity(quantity - 1)}
            style={{ opacity: quantity <= 1 ? 0.5 : 1 }}
          >
            <StepSymbol />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <NumericText value={quantity} style={styles.quantity} />
        </View>
        {item.itemId === 'scan_credit_1' ? (
          <Pressable
            hitSlop={7}
            accessibilityRole="button"
            accessibilityLabel={t('Increase')}
            accessibilityState={{ disabled: pending }}
            disabled={pending}
            onPress={() => setQuantity(quantity + 1)}
          >
            <StepSymbol plus />
          </Pressable>
        ) : null}
      </View>
      <DashedDivider />
      <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
        <MissionAction
          testID="missions-redeem"
          disabled={shortfall > 0 || !item.available || pending}
          title={
            pending ? (
              t('Loading...')
            ) : shortfall > 0 ? (
              <ShortfallLabel value={shortfall} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.actionText}>{t('Redeem')}</Text>
                <Image
                  source={require('../../../assets/images/missions/rewardBolt.png')}
                  style={{ width: 15, height: 20 }}
                />
                <NumericText value={item.price * quantity} style={styles.actionText} />
              </View>
            )
          }
          onPress={() => submit(quantity)}
        />
      </View>
    </BottomSheetScrollView>
  );
}
export function SuccessSheet({
  success,
  more,
  primary,
}: {
  success: Success;
  more: () => void;
  primary: () => void;
}) {
  const language = useAppLanguage();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { item, quantity, result } = success;
  const scan = item.itemId === 'scan_credit_1';
  // Only the scan-credit confirmation shows the balance, so only it fetches the quota.
  const transport = useMissionsTransport();
  const credits = useScanCredits({ enabled: scan, transport });
  const availableCredits = credits.data?.available;
  const date = (value: Date) =>
    new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      value,
    );
  const title = scan
    ? quantity === 1
      ? t('Claimed 1 Scan credit')
      : t('Claimed %lld Scan credits', { 0: quantity })
    : t(item.itemId === 'pro_7d' ? 'Claimed 1 Week pro' : 'Claimed 1 Month pro');
  const subtitle = scan
    ? t('You now have %lld scan credits', { 0: availableCredits ?? quantity })
    : t('Your subscription plan starts today (%@) and expires on %@.', {
        0: date(new Date()),
        1: result.subscriptionExpiresAt ? date(new Date(result.subscriptionExpiresAt)) : '—',
      });
  return (
    <BottomSheetScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        padding: 16,
        paddingTop: 12,
        paddingBottom: 12 + insets.bottom,
        gap: 16,
        flexGrow: 1,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flex: largeText ? undefined : 1,
          height: largeText ? 100 : undefined,
          minHeight: 60,
          alignSelf: 'stretch',
        }}
      >
        <RewardArt id={item.itemId} style={{ width: '100%', height: '100%' }} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ ...beVietnamPro(20, 'medium'), textAlign: 'center', color: '#363636' }}>
          {title}
        </Text>
        <Text style={{ ...styles.label, textAlign: 'center' }}>{subtitle}</Text>
      </View>
      <View style={{ height: 16 }} />
      <View
        style={{
          flexDirection: largeText ? 'column' : 'row',
          gap: 8,
          alignSelf: largeText ? 'stretch' : undefined,
        }}
      >
        <MissionAction compact title={t('Redeem more')} onPress={more} />
        <MissionAction
          compact
          blue
          title={t(scan ? 'Scan a video' : 'Explore Pro')}
          onPress={primary}
        />
      </View>
    </BottomSheetScrollView>
  );
}

/** 13-point semibold stepper strokes; independent of text font metrics. */
function StepSymbol({ plus = false }: { plus?: boolean }) {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#363636',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={13} height={13} viewBox="0 0 13 13" accessible={false}>
        <Path
          d={plus ? 'M1.5 6.5H11.5M6.5 1.5V11.5' : 'M1.5 6.5H11.5'}
          stroke="white"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function ShortfallLabel({ value }: { value: number }) {
  useAppLanguage();
  const { t } = useTranslation();
  const [before, after] = t('You need %lld more', { 0: '\uFFFC' }).split('\uFFFC');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      <Text style={styles.actionText}>{before}</Text>
      <NumericText value={value} style={styles.actionText} />
      <Text style={styles.actionText}>{after}</Text>
    </View>
  );
}
