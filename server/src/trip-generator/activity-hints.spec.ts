import { classifyActivityForItem, activityImageHint } from './activity-hints';

describe('activityImageHint', () => {
  describe('picks the right activity', () => {
    const cases: [string, string][] = [
      ['Ăn trưa tại chợ Chatuchak', 'food dishes'],
      ['Đi chợ đêm ăn vặt', 'food dishes'],
      ['Bữa tối BBQ tại Satay by the Bay', 'food dishes'],
      ['Dạo chợ Chatuchak mua đồ', 'stalls shopping'],
      ['Cà phê rooftop ngắm thành phố', 'cafe interior drinks'],
      ['Thưởng thức Phở chua Cao Bằng', 'food dishes'],
      ['Nhận phòng homestay nghỉ ngơi', 'hotel room interior'],
      ['Check-in sống ảo Wat Arun', 'architecture'],
      ['Tham quan Chùa Răng Phật', 'architecture'],
      ['Xem show ánh sáng tại Rain Vortex', 'nightlife bar night scene'],
      ['Ngắm hoàng hôn sông Chao Phraya', 'photo spot viewpoint'],
      ['Ngắm Hồ Xuân Hương Đà Lạt', 'scenic view'],
      ['Tắm biển Nha Trang', 'scenic view'],
      ['Du thuyền Vịnh Hạ Long', 'scenic view'],
      ['Khám phá Gardens by the Bay', 'scenery'],
      ['Thư giãn massage kiểu Thái', 'spa relaxing'],
    ];
    it.each(cases)('%s -> %s', (text, hint) => {
      expect(activityImageHint(text)).toBe(hint);
    });
  });

  describe('ordering: eating at a venue beats the venue type', () => {
    it('lunch AT a market is food, not shopping', () => {
      expect(activityImageHint('Ăn trưa ở chợ Bến Thành')).toBe('food dishes');
    });
    it('browsing the same market is shopping', () => {
      expect(activityImageHint('Dạo một vòng chợ Bến Thành')).toBe(
        'stalls shopping',
      );
    });
  });

  describe('Vietnamese substring false-positives (review ask #1)', () => {
    // 'ăn' must not fire inside another word: Văn, căn, sân...
    it.each([
      'Tham quan Văn Miếu Quốc Tử Giám',
      'Trải nghiệm văn hóa địa phương',
    ])('%s -> no hint', (text) => {
      expect(activityImageHint(text)).toBe('');
    });

    it('"căn hộ" is not eating, but checking in is a stay', () => {
      expect(activityImageHint('Nhận phòng căn hộ studio')).toBe(
        'hotel room interior',
      );
    });

    it('"sân bay" is not a bay (scenic view)', () => {
      expect(activityImageHint('Di chuyển ra sân bay')).toBe('');
    });

    it('"Hồ Chí Minh" is not a lake', () => {
      expect(activityImageHint('Tham quan Dinh Độc Lập ở Hồ Chí Minh')).toBe(
        '',
      );
    });

    it('"trà" fires as a word, not inside other words', () => {
      expect(activityImageHint('Thưởng trà chiều')).toBe(
        'cafe interior drinks',
      );
    });
  });

  describe('English substring false-positives', () => {
    it.each([
      ['Visit the public library', ''], // pub
      ['Tham quan showroom nội thất', ''], // show
      ['Meet the local team', ''], // tea
    ])('%s -> %s', (text, hint) => {
      expect(activityImageHint(text)).toBe(hint);
    });
  });

  it('returns empty string for transit/unknown items', () => {
    expect(activityImageHint('Di chuyển bằng xe khách')).toBe('');
    expect(activityImageHint('')).toBe('');
  });

  // Going back to the hotel IS a stay item: hotel photos are the right
  // illustration for it, and classifying it stops hotel photos from being
  // accepted anywhere else.
  it('treats returning to the hotel as a stay', () => {
    expect(activityImageHint('Di chuyển về khách sạn')).toBe(
      'hotel room interior',
    );
  });
});

describe('classifyActivityForItem', () => {
  it('lets the name decide before the description (Singapore #172 regressions)', () => {
    expect(
      classifyActivityForItem(
        'Khám phá khu phố Tàu Chinatown',
        'Dạo quanh các con phố, ghé ăn thử món địa phương tại các quầy hàng.',
      )?.id,
    ).toBe('explore');
    expect(classifyActivityForItem('Khám phá ẩm thực đường phố', '')?.id).toBe(
      'food',
    );
    expect(
      classifyActivityForItem('Dạo chơi và mua sắm tại Orchard Road', '')?.id,
    ).toBe('market');
    expect(
      classifyActivityForItem('Chill tại các quán bar ở Ann Siang Hill', '')
        ?.id,
    ).toBe('nightlife');
    expect(
      classifyActivityForItem(
        'Bữa tối Cơm gà Hải Nam tại Maxwell Food Centre',
        '',
      )?.id,
    ).toBe('food');
    expect(classifyActivityForItem('Ghé thăm', 'Bữa trưa bún chả')?.id).toBe(
      'food',
    );
  });
});
