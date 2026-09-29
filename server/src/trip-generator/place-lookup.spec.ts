import {
  compactCommonsQuery,
  isStockHost,
  parseBingImageResults,
  parseWikimediaResults,
} from './place-lookup';

describe('parseBingImageResults', () => {
  it('reads the image url and the page title from the m= attribute', () => {
    const html = `
      <a class="iusc" m="{&quot;cid&quot;:&quot;x&quot;,&quot;purl&quot;:&quot;https://example.com/maxwell&quot;,&quot;murl&quot;:&quot;https://img.example.com/maxwell-food-centre.jpg&quot;,&quot;t&quot;:&quot;Maxwell Food Centre hawker stalls, Singapore&quot;}"></a>
      <a class="iusc" m="{&quot;purl&quot;:&quot;https://example.com/dup&quot;,&quot;murl&quot;:&quot;https://img.example.com/maxwell-food-centre.jpg&quot;,&quot;t&quot;:&quot;duplicate url&quot;}"></a>
      <a class="iusc" m="{&quot;murl&quot;:&quot;https://img.example.com/IMG_0042.jpg&quot;,&quot;t&quot;:&quot;&quot;}"></a>
    `;
    expect(parseBingImageResults(html)).toEqual([
      {
        url: 'https://img.example.com/maxwell-food-centre.jpg',
        title: 'Maxwell Food Centre hawker stalls, Singapore',
      },
      { url: 'https://img.example.com/IMG_0042.jpg', title: 'IMG 0042' },
    ]);
  });

  it('falls back to bare murl scanning when the grid markup changes', () => {
    const html =
      '<script>var x = {"murl":"https://img.example.com/a.jpg","z":1},{"murl":"https://img.example.com/a.jpg"}</script>';
    expect(parseBingImageResults(html)).toEqual([
      { url: 'https://img.example.com/a.jpg', title: 'a' },
    ]);
  });
});

describe('parseWikimediaResults', () => {
  it('turns Commons search pages into titled image results, skipping non-images', () => {
    const data = {
      query: {
        pages: {
          '1': {
            title: 'File:Maxwell_Food_Centre, 2024 (02).jpg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/a/full.jpg',
                thumburl: 'https://upload.wikimedia.org/a/1600px-full.jpg',
                width: 3968,
                height: 2232,
                mime: 'image/jpeg',
              },
            ],
          },
          '2': {
            title: 'File:Navy newsletter.pdf',
            imageinfo: [{ url: 'https://x/pdf', mime: 'application/pdf' }],
          },
        },
      },
    };
    expect(parseWikimediaResults(data)).toEqual([
      {
        url: 'https://upload.wikimedia.org/a/1600px-full.jpg',
        title: 'Maxwell Food Centre, 2024 (02)',
        width: 3968,
        height: 2232,
      },
    ]);
  });
});

describe('compactCommonsQuery', () => {
  it('keeps the venue and the first destination segment only', () => {
    expect(
      compactCommonsQuery(
        'Satay by the Bay Singapore, Central Singapore Community Development Council, Singapore food dishes',
      ),
    ).toBe('Satay by the Bay Singapore');
    expect(compactCommonsQuery('"I am" cafe Da Nang')).toBe(
      'I am cafe Da Nang',
    );
  });
});

describe('isStockHost', () => {
  it('flags stock comp hosts and nothing else', () => {
    expect(isStockHost('https://c8.alamy.com/comp/D6M0W2/x.jpg')).toBe(true);
    expect(isStockHost('https://thumbs.dreamstime.com/z/a.jpg')).toBe(true);
    expect(isStockHost('https://media.istockphoto.com/id/1/p.jpg')).toBe(true);
    expect(
      isStockHost('https://upload.wikimedia.org/wikipedia/commons/a.jpg'),
    ).toBe(false);
    expect(isStockHost('not a url')).toBe(false);
  });
});
