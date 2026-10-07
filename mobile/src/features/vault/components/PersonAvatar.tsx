/**
 * Small round avatar for the end-trip consensus / settlement rows. Falls back to the same
 * default silhouette as web2 (`@/ui/components/Avatar`) — not the first-initial circle the Swift
 * views used.
 */
import { Avatar } from '@/ui/components/Avatar';

export interface PersonAvatarProps {
  uri?: string | null;
  size: number;
  testID?: string;
}

export function PersonAvatar({ uri, size, testID }: PersonAvatarProps) {
  return <Avatar uri={uri} size={size} testID={testID} />;
}
