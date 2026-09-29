import {
  activeRootModal,
  markRootModalDismissed,
  nextRootModal,
  resetRootModalPresenter,
  setActiveRootModal,
  type RootModalInputs,
} from './rootModals';

const IDLE: RootModalInputs = {
  authed: true,
  blocked: false,
  active: null,
  web3WelcomeEligible: false,
  freeTrialEligible: false,
  firstUnshownRequestId: null,
  nextInviteCode: null,
};

const inputs = (over: Partial<RootModalInputs> = {}): RootModalInputs => ({ ...IDLE, ...over });

describe('nextRootModal', () => {
  it('presents nothing when nothing is pending', () => {
    expect(nextRootModal(IDLE)).toBeNull();
  });

  it('never presents while signed out', () => {
    expect(nextRootModal(inputs({ authed: false, firstUnshownRequestId: 7 }))).toBeNull();
    expect(nextRootModal(inputs({ authed: false, freeTrialEligible: true }))).toBeNull();
  });

  it('never presents behind the forced-update gate', () => {
    expect(nextRootModal(inputs({ blocked: true, firstUnshownRequestId: 7 }))).toBeNull();
    expect(nextRootModal(inputs({ blocked: true, nextInviteCode: 'ABC123' }))).toBeNull();
  });

  it('never presents while another modal is up', () => {
    expect(
      nextRootModal(inputs({ active: { kind: 'friendRequest', id: 1 }, nextInviteCode: 'A' })),
    ).toBeNull();
    expect(
      nextRootModal(inputs({ active: { kind: 'freeTrial' }, firstUnshownRequestId: 2 })),
    ).toBeNull();
  });

  it('presents the free trial first', () => {
    expect(
      nextRootModal(
        inputs({
          freeTrialEligible: true,
          firstUnshownRequestId: 3,
          nextInviteCode: 'ABC123',
        }),
      ),
    ).toEqual({ kind: 'freeTrial' });
  });

  it('presents the web3 welcome ahead of the free trial', () => {
    expect(
      nextRootModal(
        inputs({
          web3WelcomeEligible: true,
          freeTrialEligible: true,
          firstUnshownRequestId: 3,
          nextInviteCode: 'ABC123',
        }),
      ),
    ).toEqual({ kind: 'web3Welcome' });
  });

  it('never decides a friend code — that screen is always navigated to directly', () => {
    expect(nextRootModal(inputs({ firstUnshownRequestId: 3 }))).not.toEqual(
      expect.objectContaining({ kind: 'friendCode' }),
    );
  });

  it('presents nothing while a friend-code screen owns the window', () => {
    expect(
      nextRootModal(
        inputs({
          active: { kind: 'friendCode', code: 'abc' },
          firstUnshownRequestId: 3,
          nextInviteCode: 'ABC123',
        }),
      ),
    ).toBeNull();
  });

  it('presents a friend request before a trip invite', () => {
    expect(nextRootModal(inputs({ firstUnshownRequestId: 3, nextInviteCode: 'ABC123' }))).toEqual({
      kind: 'friendRequest',
      id: 3,
    });
  });

  it('presents a trip invite when it is the only candidate', () => {
    expect(nextRootModal(inputs({ nextInviteCode: 'ABC123' }))).toEqual({
      kind: 'tripInvite',
      code: 'ABC123',
    });
  });

  it('treats request id 0 as a real id (not falsy-skipped)', () => {
    expect(nextRootModal(inputs({ firstUnshownRequestId: 0 }))).toEqual({
      kind: 'friendRequest',
      id: 0,
    });
  });

  it('ignores an empty invite code', () => {
    expect(nextRootModal(inputs({ nextInviteCode: '' }))).toBeNull();
  });

  it('re-presents once the active modal is dismissed', () => {
    const pending = { firstUnshownRequestId: 9 };
    expect(nextRootModal(inputs({ ...pending, active: { kind: 'freeTrial' } }))).toBeNull();
    expect(nextRootModal(inputs(pending))).toEqual({ kind: 'friendRequest', id: 9 });
  });
});

describe('markRootModalDismissed', () => {
  afterEach(() => {
    resetRootModalPresenter();
  });

  it('clears the window when the expected kind is the active one', () => {
    setActiveRootModal({ kind: 'friendRequest', id: 4 });
    markRootModalDismissed('friendRequest');
    expect(activeRootModal()).toBeNull();
  });

  it('no-ops when another modal owns the window', () => {
    // A deep-linked `/friend/[code]` closing on top of a live friend-request modal.
    setActiveRootModal({ kind: 'friendRequest', id: 4 });
    markRootModalDismissed('friendCode');
    expect(activeRootModal()).toEqual({ kind: 'friendRequest', id: 4 });
  });

  it('no-ops when nothing is presented', () => {
    markRootModalDismissed('friendRequest');
    expect(activeRootModal()).toBeNull();
  });

  it('clears unconditionally with no argument (M5.4 free-trial screen)', () => {
    setActiveRootModal({ kind: 'friendRequest', id: 4 });
    markRootModalDismissed();
    expect(activeRootModal()).toBeNull();
  });
});
