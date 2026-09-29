/**
 * A settings section: icon + header title, then its rows with a hairline divider between each —
 * port of `SettingView.settingSection` (SettingView.swift:592).
 */
import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SettingIconSpec } from '@/features/settings/helpers/sections';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { SettingIcon } from './SettingIcon';

export interface SettingSectionCardProps {
  icon: SettingIconSpec;
  title: string;
  children: ReactNode;
  testID?: string;
}

export function SettingSectionCard({ icon, title, children, testID }: SettingSectionCardProps) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <SettingIcon
            icon={icon}
            size={typeof icon === 'string' ? 12 : 16}
            color={colors.contentM}
          />
        </View>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.rows}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {row}
            {index < rows.length - 1 ? <View style={styles.rowDivider} /> : null}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.sm + 2,
  },
  headerIcon: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  divider: { height: 1, backgroundColor: colors.neutral200, opacity: 0.6 },
  rows: { paddingTop: spacing.xs + 1 },
  rowDivider: { height: 1, backgroundColor: colors.neutral200, opacity: 0.6 },
});
