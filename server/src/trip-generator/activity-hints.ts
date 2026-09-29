// What the traveler DOES at a place decides what its photos should show:
// an eating plan wants food shots, a market plan wants stalls, a viewpoint
// wants scenery. Keyword map is bilingual (plans are usually in Vietnamese).
//
// Each class carries three vocabularies:
//   detect  - matches the plan text, picks the class (first match wins)
//   hint    - English words appended to the image search query
//   require - words that PROVE a photo shows this activity
//   forbid  - words that PROVE it does not (a hotel room is never a dinner)
// `require`/`forbid` are matched against the ASCII-folded, lowercased image
// title, so they are written without diacritics ('mon an', not 'món ăn').
//
// Word boundaries in `detect`: \b is ASCII-only and useless for Vietnamese
// ("ăn" would match inside "Văn Miếu", "căn hộ"), so every alternation is
// wrapped in Unicode lookarounds — a match may not be glued to another letter
// on either side. Multi-word tokens ("street food", "chợ đêm") are unaffected.
const vi = (alts: string) =>
  new RegExp(String.raw`(?<!\p{L})(?:${alts})(?!\p{L})`, 'iu');

export interface ActivityClass {
  id: string;
  detect: RegExp;
  hint: string;
  require: readonly string[];
  forbid: readonly string[];
  // Query used when the venue itself yields nothing usable: it must still be
  // honest about WHERE and WHAT (e.g. "local food dishes Cao Bang"), never a
  // generic city postcard.
  fallback: string;
}

// Junk and wrong-medium results, rejected for every activity. Kitchen-supply
// listings ("trang thiết bị bếp inox") are here because they leak in on any
// Vietnamese eatery query and look like real restaurant photos.
export const UNIVERSAL_FORBID: readonly string[] = [
  'logo',
  'vector',
  'clipart',
  'icon',
  'png',
  'thumbnail',
  'wallpaper',
  'infographic',
  'ban do',
  'map',
  'so do',
  'thiet bi',
  'equipment',
  'inox',
  'cong nghiep',
  'bang gia',
  'cho thue',
  'ban nha',
  'tuyen dung',
  'recruitment',
  'meme',
  'avatar',
];

// Words that mean "somebody sleeps here". Wrong for every activity except the
// stay class (a hotel lobby is not a dinner, a bedroom is not a cafe).
const STAY_WORDS = [
  'khach san',
  'hotel',
  'phong ngu',
  'bedroom',
  'phong nghi',
  'resort',
  'nha nghi',
  'lobby',
  'le tan',
];

// Words that make the LANDSCAPE the subject of the photo. Wrong when the plan
// is about a table, a cup or a stall. Plain "núi"/"biển" are absent on purpose:
// a seaside eatery is legitimately described that way, and a photo that is
// only scenery already fails the activity requirement.
const LANDSCAPE_WORDS = [
  'thac',
  'waterfall',
  'hang dong',
  'cave',
  'phong canh',
  'landscape',
  'thien nhien',
  'toan canh',
];

const MEAL_WORDS = [
  'mon an',
  'do an',
  'menu',
  'thuc don',
  'food',
  'dish',
  'dishes',
];

// Order matters: first match wins, so eating at a market yields food photos
// while browsing the same market yields stall photos.
export const ACTIVITY_CLASSES: readonly ActivityClass[] = [
  {
    id: 'food',
    // Dish names count as eating: "Thưởng thức Phở chua Cao Bằng" never says
    // "ăn". 'bánh' is deliberately absent - it belongs to the cafe class
    // (bánh ngọt), which is checked right after this one.
    detect: vi(
      'ăn|bữa|quán ăn|quán cơm|quán nhậu|food|lunch|dinner|breakfast|street food|hải sản|seafood|buffet|lẩu|nướng|bbq|' +
        'phở|bún|cơm|xôi|cháo|mì|hủ tiếu|nem|chả|đặc sản|ẩm thực|nhà hàng|vịt quay|heo quay|restaurants?',
    ),
    hint: 'food dishes',
    require: [
      'food',
      'foods',
      'dish',
      'dishes',
      'cuisine',
      'dining',
      'restaurant',
      'restaurants',
      'eatery',
      'meal',
      'lunch',
      'dinner',
      'breakfast',
      'seafood',
      'bbq',
      'grill',
      'grilled',
      'noodle',
      'noodles',
      'soup',
      'mon an',
      'mon ngon',
      'do an',
      'an uong',
      'am thuc',
      'dac san',
      'nha hang',
      'quan an',
      'thuc don',
      'menu',
      'buffet',
      'street food',
      'ngon',
      'bua toi',
      'bua trua',
      'bua sang',
      'lau',
      'nuong',
      'pho',
      'bun',
      'com',
      'banh',
      'che',
      'nem',
      'thit',
      'vit quay',
      'hai san',
    ],
    forbid: [...STAY_WORDS, ...LANDSCAPE_WORDS],
    fallback: 'local food dishes',
  },
  {
    id: 'cafe',
    detect: vi('cà phê|cafe|coffee|trà|tea|bánh|dessert|kem|ice cream'),
    hint: 'cafe interior drinks',
    require: [
      'cafe',
      'cafes',
      'coffee',
      'ca phe',
      'coffee shop',
      'quan cafe',
      'quan nuoc',
      'tra',
      'tea',
      'tra sua',
      'milk tea',
      'latte',
      'cappuccino',
      'espresso',
      'drink',
      'drinks',
      'do uong',
      'dessert',
      'banh ngot',
      'kem',
      'ice cream',
      'khong gian',
      'check in',
    ],
    // A bowl of pho is not a coffee: heavy-meal words are wrong here even
    // though the venue may also serve them.
    forbid: [
      ...STAY_WORDS,
      ...LANDSCAPE_WORDS,
      'pho',
      'bun',
      'com',
      'lau',
      'nuong',
      'hai san',
      'seafood',
      'buffet',
      'nha hang',
    ],
    fallback: 'cafe interior drinks',
  },
  {
    id: 'nightlife',
    detect: vi(
      'bars?|pubs?|(?<!beach )clubs?|rooftop|đêm|nightlife|night markets?|chợ đêm|shows?|trình diễn|biểu diễn|ánh sáng',
    ),
    hint: 'nightlife bar night scene',
    require: [
      'bar',
      'bars',
      'pub',
      'club',
      'rooftop',
      'dem',
      'night',
      'nightlife',
      'cocktail',
      'beer',
      'bia',
      'live music',
      'am nhac',
      'show',
      'neon',
      'cho dem',
      'night market',
      'len den',
      've dem',
    ],
    forbid: ['phong ngu', 'bedroom'],
    fallback: 'night street lights',
  },
  {
    id: 'market',
    detect: vi('chợ|markets?|mua sắm|shopping|malls?|outlets?'),
    hint: 'stalls shopping',
    require: [
      'cho',
      'market',
      'markets',
      'stall',
      'stalls',
      'sap hang',
      'gian hang',
      'shopping',
      'mall',
      'souvenir',
      'qua luu niem',
      'tieu thuong',
      'ban hang',
      'hang hoa',
      'dac san',
      'phien cho',
    ],
    forbid: [...STAY_WORDS],
    fallback: 'market stalls',
  },
  {
    id: 'temple',
    detect: vi(
      'chùa|đền|temples?|wat|pagodas?|nhà thờ|church(es)?|cathedrals?',
    ),
    hint: 'architecture',
    require: [
      'chua',
      'temple',
      'temples',
      'pagoda',
      'den',
      'nha tho',
      'church',
      'cathedral',
      'kien truc',
      'architecture',
      'di tich',
      'thap',
      'tuong',
      'co kinh',
      'linh thieng',
    ],
    forbid: [...STAY_WORDS, ...MEAL_WORDS],
    fallback: 'temple architecture',
  },
  // 'hồ(?! chí)' avoids "Hồ Chí Minh"; no bare 'bay' ("sân bay" = airport).
  {
    id: 'nature',
    detect: vi(
      'biển|beach(es)?|đảo|islands?|hồ(?! chí)|lakes?|thác|waterfalls?|vịnh',
    ),
    hint: 'scenic view',
    require: [
      'thac',
      'waterfall',
      'bien',
      'beach',
      'ho',
      'lake',
      'dao',
      'island',
      'vinh',
      'nui',
      'mountain',
      'hang',
      'cave',
      'song',
      'river',
      'suoi',
      'view',
      'canh',
      'phong canh',
      'toan canh',
      'landscape',
      'scenery',
      'thien nhien',
      'nature',
      'hoang hon',
      'sunset',
      'binh minh',
    ],
    forbid: [...STAY_WORDS, ...MEAL_WORDS],
    fallback: 'scenic landscape',
  },
  {
    id: 'museum',
    detect: vi('bảo tàng|museums?|triển lãm|galler(y|ies)|exhibitions?'),
    hint: 'exhibits interior',
    require: [
      'bao tang',
      'museum',
      'trien lam',
      'exhibition',
      'gallery',
      'hien vat',
      'artifact',
      'trung bay',
      'lich su',
      'history',
    ],
    forbid: [...STAY_WORDS, ...MEAL_WORDS],
    fallback: 'museum exhibits',
  },
  {
    id: 'park',
    detect: vi('công viên|parks?|vườn|gardens?|zoos?|thủy cung|aquariums?'),
    hint: 'scenery',
    require: [
      'cong vien',
      'park',
      'vuon',
      'garden',
      'gardens',
      'zoo',
      'thuy cung',
      'aquarium',
      'hoa',
      'flower',
      'cay xanh',
      'canh',
      'scenery',
      'thien nhien',
    ],
    forbid: [...STAY_WORDS, ...MEAL_WORDS],
    fallback: 'park scenery',
  },
  {
    id: 'spa',
    detect: vi('spas?|massage|onsen|tắm'),
    hint: 'spa relaxing',
    require: [
      'spa',
      'massage',
      'onsen',
      'tam',
      'bon tam',
      'suoi khoang',
      'xong hoi',
      'thu gian',
      'relax',
    ],
    forbid: [...MEAL_WORDS],
    fallback: 'spa relaxing',
  },
  // Walking a district (Chinatown, the old quarter, a bar street): the photo
  // should show the streets and shophouses, not one dish. Sits before 'photo'
  // and after every venue-specific class so "khám phá chợ đêm" still lands in
  // nightlife and "khám phá ẩm thực" (a food tour) stays with food.
  {
    id: 'explore',
    detect: vi(
      'khám phá|dạo|đi dạo|tản bộ|explore|stroll|wander|walk(ing)? tour|walk around|khu phố|phố cổ|old (town|quarter)|chinatown|little india|kampong',
    ),
    hint: 'street scenery',
    require: [
      'street',
      'streets',
      'pho',
      'khu',
      'district',
      'quarter',
      'chinatown',
      'old town',
      'pho co',
      'alley',
      'hem',
      'shophouse',
      'shophouses',
      'architecture',
      'kien truc',
      'view',
      'skyline',
      'walk',
      'walking',
      'dao',
      'tham quan',
    ],
    forbid: [...STAY_WORDS],
    fallback: 'street scenery',
  },
  {
    id: 'photo',
    detect: vi(
      'check.?ins?|sống ảo|chụp|ngắm|views?|toàn cảnh|viewpoints?|photos?',
    ),
    hint: 'photo spot viewpoint',
    require: [
      'view',
      'viewpoint',
      'check in',
      'checkin',
      'song ao',
      'chup anh',
      'photo',
      'canh',
      'toan canh',
      'ngam',
      'hoang hon',
      'sunset',
      'binh minh',
      'doi',
      'dinh',
      'scenery',
      'landscape',
    ],
    forbid: [...MEAL_WORDS],
    fallback: 'viewpoint scenery',
  },
  // Last on purpose: "ngắm hoàng hôn tại homestay" is a sunset shot, not a
  // bedroom shot. Only plans that are ONLY about the stay land here.
  {
    id: 'stay',
    detect: vi(
      'homestays?|khách sạn|hotels?|resorts?|nhà nghỉ|nhận phòng|check.?out|lưu trú|nghỉ ngơi|villas?|bungalows?',
    ),
    hint: 'hotel room interior',
    require: [
      'homestay',
      'hotel',
      'khach san',
      'resort',
      'phong',
      'room',
      'rooms',
      'bedroom',
      'lobby',
      'nha nghi',
      'luu tru',
      'villa',
      'bungalow',
      'noi o',
      'view phong',
    ],
    forbid: [...MEAL_WORDS],
    fallback: 'homestay room interior',
  },
];

const CLASS_BY_ID = new Map(ACTIVITY_CLASSES.map((c) => [c.id, c]));

// The activity class of a plan (null when the text says nothing usable, e.g.
// pure transit items).
export function classifyActivity(text: string): ActivityClass | null {
  for (const c of ACTIVITY_CLASSES) {
    if (c.detect.test(text)) return c;
  }
  return null;
}

// The plan NAME says what the traveler does ("Khám phá khu phố Tàu"); the
// description often mentions everything else there is at the place (the food
// stalls of Chinatown), which used to drag a sightseeing stop into the food
// class and get every street photo rejected for "not showing dishes". Classify
// on the name first and only fall back to the description when the name is
// silent.
export function classifyActivityForItem(
  name: string,
  description?: string,
): ActivityClass | null {
  return classifyActivity(name) ?? classifyActivity(description ?? '');
}

export function activityClassById(id: string): ActivityClass | null {
  return CLASS_BY_ID.get(id) ?? null;
}

// English hint describing the activity in `text` ('' when unknown).
export function activityImageHint(text: string): string {
  return classifyActivity(text)?.hint ?? '';
}
