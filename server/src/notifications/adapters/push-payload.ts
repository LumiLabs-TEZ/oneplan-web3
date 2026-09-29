export type PushType =
  | 'chat'
  | 'friend_request'
  | 'friend_accepted'
  | 'trip_invite'
  | 'member_joined'
  | 'member_left'
  | 'trip_started'
  | 'trip_auto_start_blocked'
  | 'vault_leave_announced'
  | 'plan_reminder'
  | 'listing_approved'
  | 'listing_rejected'
  | 'pin_extraction_completed'
  | 'trip_request_fulfilled'
  | 'engagement_dormant'
  | 'engagement_new_plan'
  | 'engagement_unfinished_plan'
  | 'engagement_weather'
  | 'mission_completed';

export interface LogicalPushPayload {
  type: PushType;
  title: string;
  body: string;
  threadId?: string;
  badge?: number;
  // Lower APNs priority (5 = throttle-able) for non-urgent marketing/engagement
  // pushes so they don't compete with time-sensitive alerts. Omit for default (10).
  priority?: number;
  data: Record<string, string>;
}

export const PushPayloadBuilder = {
  chat(input: {
    tripId: number;
    tripName: string;
    senderName: string;
    content: string;
  }): LogicalPushPayload {
    const truncated =
      input.content.length > 100
        ? input.content.slice(0, 100) + '…'
        : input.content;
    return {
      type: 'chat',
      title: input.tripName,
      body: truncated,
      threadId: `trip-${input.tripId}`,
      badge: 1,
      data: {
        tripId: String(input.tripId),
        senderName: input.senderName,
      },
    };
  },

  friendRequest(input: { senderDisplayName: string }): LogicalPushPayload {
    return {
      type: 'friend_request',
      title: 'Friend Request',
      body: `${input.senderDisplayName} wants to be your friend`,
      badge: 1,
      data: {},
    };
  },

  friendAccepted(input: { accepterDisplayName: string }): LogicalPushPayload {
    return {
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      body: `${input.accepterDisplayName} accepted your friend request`,
      badge: 1,
      data: {},
    };
  },

  tripInvite(input: {
    inviterDisplayName: string;
    tripName: string;
    inviteCode: string;
  }): LogicalPushPayload {
    return {
      type: 'trip_invite',
      title: 'Trip Invitation',
      body: `${input.inviterDisplayName} invited you to ${input.tripName}`,
      badge: 1,
      data: { inviteCode: input.inviteCode },
    };
  },

  memberLeft(input: {
    tripId: number;
    tripName: string;
    leavingUserName: string;
  }): LogicalPushPayload {
    return {
      type: 'member_left',
      title: input.tripName,
      body: `${input.leavingUserName} has left the trip`,
      threadId: `trip-${input.tripId}`,
      badge: 1,
      data: { tripId: String(input.tripId) },
    };
  },

  vaultLeaveAnnounced(input: {
    tripId: number;
    tripName: string;
    leavingUserName: string;
  }): LogicalPushPayload {
    return {
      type: 'vault_leave_announced',
      title: input.tripName,
      body: `${input.leavingUserName} wants to leave — confirm settlement`,
      threadId: `trip-${input.tripId}`,
      badge: 1,
      data: { tripId: String(input.tripId) },
    };
  },

  memberJoined(input: {
    tripId: number;
    tripName: string;
    joiningUserName: string;
  }): LogicalPushPayload {
    return {
      type: 'member_joined',
      title: input.tripName,
      body: `${input.joiningUserName} has joined the trip`,
      threadId: `trip-${input.tripId}`,
      badge: 1,
      data: { tripId: String(input.tripId) },
    };
  },

  tripStarted(input: { tripId: number; tripName: string }): LogicalPushPayload {
    return {
      type: 'trip_started',
      title: input.tripName,
      body: 'Your trip has started. Have a great time!',
      threadId: `trip-${input.tripId}`,
      badge: 1,
      data: { tripId: String(input.tripId) },
    };
  },

  tripAutoStartBlocked(input: {
    tripId: number;
    tripName: string;
    memberNames: string[];
  }): LogicalPushPayload {
    return {
      type: 'trip_auto_start_blocked',
      title: input.tripName,
      body: `Couldn't start automatically: ${input.memberNames.join(', ')} are still on another trip. Open the trip to start it.`,
      threadId: `trip-${input.tripId}`,
      badge: 1,
      data: { tripId: String(input.tripId) },
    };
  },

  planReminder(input: {
    tripId: number;
    tripName: string;
    planItem: {
      id: number;
      title: string;
      startTime: string;
      location: string | null;
    };
  }): LogicalPushPayload {
    const body = input.planItem.location
      ? `${input.planItem.title} at ${input.planItem.startTime} • ${input.planItem.location}`
      : `${input.planItem.title} at ${input.planItem.startTime}`;
    return {
      type: 'plan_reminder',
      title: input.tripName,
      body,
      threadId: `trip-${input.tripId}`,
      data: {
        tripId: String(input.tripId),
        planItemId: String(input.planItem.id),
      },
    };
  },

  listingStatus(input: {
    listingId: number;
    listingName: string;
    approved: boolean;
  }): LogicalPushPayload {
    return {
      type: input.approved ? 'listing_approved' : 'listing_rejected',
      title: input.approved ? 'Listing approved' : 'Listing rejected',
      body: input.approved
        ? `Your listing "${input.listingName}" was approved.`
        : `Your listing "${input.listingName}" was rejected.`,
      badge: 1,
      data: { listingId: String(input.listingId) },
    };
  },

  tripRequestFulfilled(input: {
    destinationName: string;
    listingId: number;
  }): LogicalPushPayload {
    return {
      type: 'trip_request_fulfilled',
      title: 'Your trip plan is ready',
      body: `A plan for ${input.destinationName} is now available on the Market`,
      badge: 1,
      data: { listingId: String(input.listingId) },
    };
  },

  // Marketing / daily-nudge push. No badge mutation (never clobbers the
  // user's real unread count) and throttle-able priority — see LogicalPushPayload.priority.
  //
  // `type` carries the specific engagement_* subtype (not a generic
  // 'engagement' bucket) so it survives FcmPushAdapter's reserved-routing-key
  // precedence: that adapter spreads payload.data BEFORE setting
  // `type: payload.type`, so a `type` key nested inside `data` (the old
  // shape) was always clobbered back to the generic value on Android —
  // engagement pushes never carried their subtype over FCM. Putting the
  // subtype on the outer field instead of duplicating it in `data` makes it
  // survive on both adapters.
  engagement(input: {
    title: string;
    body: string;
    deepLink: { type: string; tripId?: number; listingId?: number };
  }): LogicalPushPayload {
    return {
      type: input.deepLink.type as PushType,
      title: input.title,
      body: input.body,
      threadId: 'engagement',
      priority: 5,
      data: {
        ...(input.deepLink.tripId != null
          ? { tripId: String(input.deepLink.tripId) }
          : {}),
        ...(input.deepLink.listingId != null
          ? { listingId: String(input.deepLink.listingId) }
          : {}),
      },
    };
  },

  missionCompleted(input: {
    missionId: string;
    rewardAmount: number;
  }): LogicalPushPayload {
    return {
      type: 'mission_completed',
      title: 'Mission complete! ⚡',
      body: `You earned ${input.rewardAmount}⚡.`,
      threadId: 'missions',
      data: {
        missionId: input.missionId,
        rewardAmount: String(input.rewardAmount),
      },
    };
  },

  pinExtractionCompleted(input: {
    sessionId: string;
    status: 'DONE' | 'FAILED';
    pinCount: number;
    videoTitle?: string;
  }): LogicalPushPayload {
    if (input.status === 'DONE') {
      const titleClause = input.videoTitle
        ? ` from "${input.videoTitle.slice(0, 48)}"`
        : '';
      return {
        type: 'pin_extraction_completed',
        title: 'Pins ready!',
        body: `${input.pinCount} pin${input.pinCount === 1 ? '' : 's'} extracted${titleClause}.`,
        badge: 1,
        data: { sessionId: input.sessionId, status: input.status },
      };
    }
    return {
      type: 'pin_extraction_completed',
      title: 'Extraction failed',
      body: "We couldn't pull pins from that video. Tap to see details.",
      badge: 1,
      data: { sessionId: input.sessionId, status: input.status },
    };
  },
};
