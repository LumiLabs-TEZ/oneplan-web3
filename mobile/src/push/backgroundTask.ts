import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { extractData } from './payload';

/**
 * Android receives DATA-ONLY FCM messages from the server
 * (server/src/notifications/adapters/fcm-push.adapter.ts), so nothing is shown
 * unless the app renders a local notification itself — including when the app
 * is killed. This background task is the Phase 0 spike for that path; the
 * Phase 1 push module builds on it (payload routing table from
 * NotificationDelegate.swift).
 *
 * Must be imported at module top level (root layout) so the task is defined
 * before the OS wakes the headless JS context.
 */
export const BACKGROUND_NOTIFICATION_TASK = 'ONEPLAN_BACKGROUND_NOTIFICATION_TASK';

/** String-only view of the payload for the local notification's `data` (Android extras are strings). */
function stringifyData(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(extractData(raw))) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) return;
  const payload = stringifyData(data);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: payload.title ?? 'OnePlan',
      body: payload.body ?? payload.type ?? '',
      data: payload,
    },
    trigger: null,
  });
});

export async function registerBackgroundNotificationTask(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Android 8+ requires a channel before any notification is shown; the
 * background task above posts to the default one. No-op elsewhere.
 */
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Foreground: show every push as a banner (iOS default hides them). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
