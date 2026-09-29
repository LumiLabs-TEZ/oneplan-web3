export const reviewURL = (platform: string) =>
  platform === 'ios'
    ? 'https://apps.apple.com/app/id6761648165?action=write-review'
    : 'https://play.google.com/store/apps/details?id=com.oneplan.android';
/** A successful store handoff is the server's documented event, never proof of a written review. */
export async function openReview(
  platform: string,
  open: (url: string) => Promise<unknown>,
  report: () => Promise<unknown>,
) {
  await open(reviewURL(platform));
  await report();
}
