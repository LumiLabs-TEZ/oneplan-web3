import { openReview } from './review';
it.each(['ios', 'android'])('reports only after the %s store handoff', async (platform) => {
  const calls: string[] = [];
  await openReview(
    platform,
    async (url) => {
      calls.push(url);
    },
    async () => {
      calls.push('report');
    },
  );
  expect(calls[0]).toContain(platform === 'ios' ? 'action=write-review' : 'id=com.oneplan.android');
  expect(calls[1]).toBe('report');
});
it('does not award when opening the store fails', async () => {
  const report = jest.fn();
  await expect(
    openReview(
      'ios',
      async () => {
        throw new Error('unavailable');
      },
      report,
    ),
  ).rejects.toThrow();
  expect(report).not.toHaveBeenCalled();
});
