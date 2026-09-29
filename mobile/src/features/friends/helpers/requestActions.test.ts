import { actionsFor } from './requestActions';

describe('actionsFor', () => {
  it('none → [add]', () => {
    expect(actionsFor('none')).toEqual(['add']);
  });

  it('pending_sent → [cancel]', () => {
    expect(actionsFor('pending_sent')).toEqual(['cancel']);
  });

  it('pending_received → [accept, decline]', () => {
    expect(actionsFor('pending_received')).toEqual(['accept', 'decline']);
  });

  it('friends → []', () => {
    expect(actionsFor('friends')).toEqual([]);
  });
});
