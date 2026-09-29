// Every mission id the server can send must have local copy, otherwise the
// row is silently dropped from the sheet.
// Ported from ios OnePlanTests/MissionRowModelTests.swift. The Swift list also
// carried `weekly_streak`, which no longer exists in the server catalog
// (server/src/missions/mission-defs.ts) nor the iOS copy table, so it is
// covered here as an unknown id instead.

import { MISSION_COPY, missionRowFromDto, type MissionStateDto } from './missionRow';

const allMissionIds = [
  'first_trip',
  'first_board',
  'first_scan',
  'first_expense',
  'apply_plan',
  'invite_2',
  'friend_joined',
  'trip_settled',
  'share_plan',
  'rate_plan',
  'upload_plan',
  'appstore_review',
  'plan_ahead',
];

function dto(id: string, reward = 10, completed = false): MissionStateDto {
  return {
    missionId: id,
    group: 'getting_started',
    rewardAmount: reward,
    completed,
    completedAt: completed ? '2026-08-13T00:00:00.000Z' : null,
  };
}

describe('MissionRowModel', () => {
  test('the copy table covers exactly the server mission catalog', () => {
    expect(Object.keys(MISSION_COPY).sort()).toEqual([...allMissionIds].sort());
  });

  test.each(allMissionIds)('Every catalog mission id maps to a row (%s)', (id) => {
    const row = missionRowFromDto(dto(id));
    expect(row).toBeDefined();
    expect(row?.id).toBe(id);
    expect(row?.title).not.toBe('');
    expect(row?.subtitle).not.toBe('');
  });

  test.each(allMissionIds)('reward and completed come from the DTO (%s)', (id) => {
    const pending = missionRowFromDto(dto(id, 25));
    expect(pending?.reward).toBe(25);
    expect(pending?.completed).toBe(false);

    const done = missionRowFromDto(dto(id, 5, true));
    expect(done?.reward).toBe(5);
    expect(done?.completed).toBe(true);
  });

  test.each(['', 'unknown_mission', 'First_Trip', 'weekly_streak'])(
    'Unknown mission ids are dropped (%j)',
    (id) => {
      expect(missionRowFromDto(dto(id))).toBeUndefined();
    },
  );

  test('copy is routed through the translator, defaulting to the English key', () => {
    const plain = missionRowFromDto(dto('first_trip'));
    expect(plain?.title).toBe('Create your first trip');
    expect(plain?.subtitle).toBe('Start planning your next getaway');

    const translated = missionRowFromDto(dto('first_trip'), (key) => `vi:${key}`);
    expect(translated?.title).toBe('vi:Create your first trip');
    expect(translated?.subtitle).toBe('vi:Start planning your next getaway');
  });

  test('rewardAmount is truncated to an integer like Swift Int()', () => {
    expect(missionRowFromDto(dto('first_trip', 12.9))?.reward).toBe(12);
  });
});
