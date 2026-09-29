/**
 * App logo tile + version/commit text — port of `SettingView.buildFooter` (SettingView.swift:393).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { svg } from '@/ui/assets';
import { colors, spacing } from '@/ui/theme';

const AppLogoCutout = svg.illustration.appLogoCutout;

export interface SettingsFooterProps {
  versionLabel: string;
  commit: string;
  /** Running EAS Update bundle (`dev · 01a0dd0` / `dev · embedded`); RN-only. */
  updateLabel?: string;
}

export function SettingsFooter({ versionLabel, commit, updateLabel }: SettingsFooterProps) {
  return (
    <View
      style={styles.root}
      testID="settings-footer"
      accessible
      accessibilityElementsHidden={false}
    >
      <LinearGradient colors={[colors.black, colors.blueBase]} style={styles.logoTile}>
        <AppLogoCutout width={18} height={18} />
      </LinearGradient>
      <View style={styles.text}>
        <Text style={styles.line} numberOfLines={1} minimumFontScale={0.85} adjustsFontSizeToFit>
          {versionLabel}
        </Text>
        <Text style={styles.line} numberOfLines={1} minimumFontScale={0.85} adjustsFontSizeToFit>
          {commit}
        </Text>
        {updateLabel ? (
          <Text style={styles.line} numberOfLines={1} minimumFontScale={0.85} adjustsFontSizeToFit>
            {updateLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.sm - 3,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  logoTile: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { alignItems: 'center', gap: 3 },
  line: { fontSize: 12, fontWeight: '500', color: colors.contentM },
});
