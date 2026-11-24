import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.TICKETBOX_BUYER_URL || 'http://localhost:5185').origin;
const when = (days = 0) => new Date(Date.now() + days * 86_400_000).toISOString();
const poster = new URL('/discovery-fixture.jpg', origin).href;
const makeConcert = (id, overrides = {}) => ({
  id, title: 'Riverside Concert ' + id, venueName: 'Riverside Theatre', eventDate: when(7),
  status: 'ON_SALE', saleStartAt: when(-1), saleEndAt: when(6), posterUrl: poster, ...overrides,
});
const upcoming = makeConcert('future-sale', { title: 'Sunrise Jazz', saleStartAt: when(2), posterUrl: null });
const featured = makeConcert('chamber', { title: 'Chamber Night', translations: {
  vi: { title: 'Đêm nhạc thính phòng Hải Đăng' },
  en: { title: 'Chamber Night at the Riverside Theatre, with the Full Anniversary Ensemble' },
} });
const firstPage = [featured, upcoming, ...Array.from({ length: 58 }, (_, index) => makeConcert(String(index)))];
const nextPage = [
  makeConcert('translated', { title: 'Late Night Orchestra', translations: { vi: { title: 'Đêm nhạc Đại Dương' } } }),
  makeConcert('rare', { title: 'Rare Starlight Symphony', venueName: 'Nhà hát Hòa Bình' }),
];
const nativeEvent = {
  id: 'native-event', title: 'Harbour Lights Live',
  performances: [{
    id: 'native-show', venueName: 'Harbour Concert Hall', startsAt: when(4),
    saleStartAt: when(-1), saleEndAt: when(3), status: 'ON_SALE',
    salesSuspended: false, legacyConcertId: null,
  }],
};
nativeEvent.performances.push({
  ...nativeEvent.performances[0], id: 'native-suspended', venueName: 'City Concert Hall',
  startsAt: when(5), salesSuspended: true,
});
const laterEvent = {
  id: 'native-later', title: 'Highland Orchestra',
  performances: [{ ...nativeEvent.performances[0], id: 'native-later-show' }],
};
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: origin, locale: 'en-US', viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const requests = [];
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
let failNextPage = true;
let failFirstPage = false;
let catalogDelay;

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  const path = url.pathname;
  if (path === '/discovery-fixture.jpg') return route.fulfill({
    contentType: 'image/jpeg',
    body: Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCOMZL/2Q==', 'base64'),
  });
  if (!path.startsWith('/api/')) return route.continue();
  const reply = (data, status = 200) => route.fulfill({ status, json: { code: status, data } });
  if (path === '/api/v2/events/discovery') {
    const number = Number(url.searchParams.get('page'));
    const size = Number(url.searchParams.get('size'));
    const q = url.searchParams.get('q') ?? '';
    const status = url.searchParams.get('status');
    const date = url.searchParams.get('date');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    requests.push({ number, q, status, date, from, to });
    if (number === 0 && catalogDelay) await catalogDelay;
    if (number === 0 && failFirstPage) return reply(null, 503);
    if (number > 0 && failNextPage) {
      failNextPage = false;
      return reply(null, 503);
    }

    const toCard = (event, show = event.performances[0]) => ({
      id: show.id, eventId: event.id, title: event.title, venueName: show.venueName,
      eventDate: show.startsAt, saleStartAt: show.saleStartAt, saleEndAt: show.saleEndAt,
      status: show.status, salesSuspended: show.salesSuspended, posterUrl: null,
    });
    let all = [toCard(nativeEvent), ...firstPage, toCard(laterEvent), ...nextPage];
    if (q === 'city concert hall') all = [toCard(nativeEvent, nativeEvent.performances[1])];
    else if (q === 'dem nhac dai duong') all = [nextPage[0]];
    else if (q === 'nha hat hoa binh') all = [nextPage[1]];
    else if (q) all = [];
    if (status === 'upcoming' || date === 'custom') all = all.filter(({ id }) => id === upcoming.id);
    if (date === 'today') all = [];
    const totalPages = Math.ceil(all.length / size);
    return reply({
      content: all.slice(number * size, (number + 1) * size),
      number, size, totalElements: all.length, totalPages, last: number >= totalPages - 1,
    });
  }
  if (path === '/api/concerts/rare') {
    return reply({ ...nextPage[1], description: 'Fixture show', ticketTypes: [] });
  }
  if (path === '/api/v2/events/native-event') return reply(nativeEvent);
  if (path.endsWith('/ticket-types')) return reply([]);
  return reply(null, 404);
});

const main = page.getByRole('main');
const results = () => main.getByRole('region', { name: /Upcoming events|Search results|Sự kiện sắp tới|Kết quả tìm kiếm/i });

try {
  await page.goto('/events');
  await results().getByRole('link', { name: /Sunrise Jazz/ }).getByText('Coming soon', { exact: true }).waitFor();
  assert.equal(await results().getByText('64 events', { exact: true }).count(), 1);
  assert.equal(await main.getByText('City', { exact: true }).count(), 0, 'Fixture filters stay in preview.');
  const search = async (query) => {
    if (!(await page.getByRole('banner').getByRole('searchbox').isVisible())) {
      await page.getByRole('banner').getByRole('button', { name: 'Find events', exact: true }).click();
    }
    const input = page.getByRole('banner').getByRole('searchbox');
    await input.fill(query);
    await input.press('Enter');
    await page.waitForURL((url) => url.pathname === '/events' && (url.searchParams.get('q') ?? '') === query);
  };
  const native = results().getByRole('link', { name: new RegExp(nativeEvent.title) });
  await native.getByText('On sale', { exact: true }).waitFor();
  assert.equal(await native.count(), 1, 'Multiple performances share one event card.');
  await search('city concert hall');
  await native.getByText('Sales ended', { exact: true }).waitFor();
  await native.click();
  assert.equal(new URL(page.url()).pathname, '/events/native-event');
  await main.getByRole('heading', { name: nativeEvent.title }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('performance'), 'native-suspended');
  await page.waitForFunction(() => document.activeElement?.textContent.includes('City Concert Hall'));
  await page.goBack();
  await native.waitFor();

  await search('dat phong');
  await results().getByText('No events match these filters.').waitFor();
  assert.equal(await results().getByRole('button', { name: 'Load more events' }).count(), 0);
  await search('dem nhac dai duong');
  await results().getByRole('link', { name: /Late Night Orchestra/ }).waitFor();
  assert(requests.some(({ number, q }) => number === 0 && q === 'dem nhac dai duong'));
  await search('nha hat hoa binh');
  const rare = results().getByRole('link', { name: /Rare Starlight Symphony/ });
  await rare.waitFor();
  await rare.click();
  await main.getByRole('heading', { name: 'Rare Starlight Symphony' }).waitFor();
  assert.equal(await main.getByRole('link', { name: 'All events' }).getAttribute('href'), '/events');
  await page.goBack();
  await rare.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'nha hat hoa binh');

  await results().getByRole('button', { name: 'Clear all' }).click();
  const openingSoon = results().getByRole('link', { name: /Sunrise Jazz/ });
  await results().getByRole('button', { name: 'Load more events' }).click();
  await results().getByText('Could not load more events.').waitFor();
  assert(await openingSoon.isVisible(), 'A failed page keeps the previously loaded results.');
  await results().getByRole('button', { name: 'Try again' }).click();
  await results().getByRole('button', { name: 'Load more events' }).click();
  await rare.waitFor();
  assert.equal(requests.filter(({ number, q }) => number === 1 && q === '').length, 2);
  await rare.scrollIntoViewIfNeeded();
  await rare.evaluate((node) => node.addEventListener('click', () => {
    sessionStorage.setItem('discovery-fixture-link-top', String(node.getBoundingClientRect().top));
  }, { once: true }));
  await rare.click();
  await main.getByRole('heading', { name: 'Rare Starlight Symphony' }).waitFor();
  const before = Number(await page.evaluate(() => sessionStorage.getItem('discovery-fixture-link-top')));
  await page.goBack();
  await rare.waitFor();
  await page.waitForFunction((top) => {
    const link = document.querySelector('#discover-concerts a[href="/concerts/rare"]');
    return link && Math.abs(link.getBoundingClientRect().top - top) < 24 && link === document.activeElement;
  }, before);

  await page.goto('/?status=DRAFT');
  await page.waitForURL((url) => url.pathname === '/events');
  await openingSoon.waitFor();
  assert.equal(requests.at(-1).status, 'upcoming');
  await page.goto('/?status=' + encodeURIComponent('Sắp mở bán'));
  await page.waitForURL((url) => url.pathname === '/events');
  await openingSoon.waitFor();

  const filterDisclosure = results().locator('summary');
  await filterDisclosure.focus();
  await page.keyboard.press('Enter');
  await results().getByRole('combobox', { name: 'Event date', exact: true }).selectOption('today');
  await results().getByRole('button', { name: 'Apply filters' }).click();
  await results().getByText('No events match these filters.').waitFor();
  assert.equal(requests.at(-1).date, 'today');
  await results().getByRole('button', { name: 'Remove Today filter' }).click();
  assert.equal(new URL(page.url()).searchParams.has('date'), false);

  const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(upcoming.eventDate));
  await results().locator('summary').click();
  await results().getByRole('combobox', { name: 'Event date', exact: true }).selectOption('custom');
  await results().getByLabel('From date').fill(localDay);
  await results().getByLabel('To date').fill(localDay);
  await page.setViewportSize({ width: 320, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await results().getByRole('button', { name: 'Apply filters' }).click();
  await openingSoon.waitFor();
  assert.equal(requests.at(-1).from, localDay);
  assert.equal(requests.at(-1).to, localDay);
  await page.reload();
  await openingSoon.waitFor();

  for (const language of ['en', 'vi']) {
    await page.evaluate((value) => localStorage.setItem('ticketbox.language', value), language);
    for (const path of ['/', '/events']) {
      await page.goto(path);
      if (path === '/') {
        await main.getByRole('heading', { name: /Chamber Night|Đêm nhạc thính phòng/ }).waitFor();
        assert.equal(await results().getByRole('link', { name: /Chamber Night|Đêm nhạc thính phòng/ }).count(), 0);
        assert.equal(await main.getByRole('searchbox').count(), 0, 'Homepage uses the shared header search.');
        await main.getByRole('link', { name: /Browse all events|Xem tất cả sự kiện/i }).waitFor();
      }
      assert.equal(await page.getByRole('contentinfo').getByRole('link', { name: /Browse events|Khám phá sự kiện/i }).getAttribute('href'), '/events');
      await openingSoon.waitFor();
      for (const width of [320, 390, 834, 1440, 2560]) {
        await page.setViewportSize({ width, height: 924 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, `${language} ${path} at ${width}px overflows by ${overflow}px`);
        if (width === 2560) {
          const bounds = await page.locator('.discovery-page').boundingBox();
          assert(bounds.width > width * .85, 'Discovery uses most of a wide display.');
        }
        if (process.env.TICKETBOX_DISCOVERY_SCREENSHOTS) {
          const screen = path === '/' ? 'home' : 'catalogue';
          await page.screenshot({ path: `${process.env.TICKETBOX_DISCOVERY_SCREENSHOTS}/${screen}-${language}-${width}.png` });
        }
      }
    }
  }

  await page.evaluate(() => localStorage.setItem('ticketbox.language', 'en'));
  let releaseCatalog;
  catalogDelay = new Promise((release) => { releaseCatalog = release; });
  await page.goto('/events?q=not-in-catalog#discover-concerts', { waitUntil: 'domcontentloaded' });
  const headerSearch = page.getByRole('banner').getByRole('searchbox');
  await headerSearch.fill('a new search in progress');
  releaseCatalog();
  catalogDelay = undefined;
  await results().getByText('No events match these filters.').waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await headerSearch.evaluate((node) => node === document.activeElement), true);
  assert.equal(await headerSearch.inputValue(), 'a new search in progress');

  failFirstPage = true;
  await page.goto('/events');
  await results().getByText('Could not load events.', { exact: true }).waitFor();
  failFirstPage = false;
  await results().getByRole('button', { name: 'Try again' }).click();
  await openingSoon.waitFor();

  const beforePreview = requests.length;
  await page.goto('/discover-preview');
  await main.getByText('Illustrative data', { exact: true }).waitFor();
  await results().locator('summary').click();
  await results().getByRole('combobox', { name: 'City', exact: true }).selectOption('hanoi');
  await results().getByRole('combobox', { name: 'Category', exact: true }).selectOption('jazz');
  await results().getByRole('combobox', { name: 'Price', exact: true }).selectOption('under-500000');
  await results().getByRole('button', { name: 'Apply filters' }).click();
  assert.equal(await results().getByRole('article').count(), 1);
  await results().getByRole('button', { name: 'Clear all' }).click();
  assert((await results().getByRole('article').count()) > 1);
  assert.equal(requests.length, beforePreview, 'Preview does not request any Catalog pages.');
  console.log('Buyer discovery, pagination, Back restoration, legacy URLs, and isolated preview passed.');
} catch (error) {
  console.error('Discovery failure at', new URL(page.url()).pathname + new URL(page.url()).search,
    'Recent Catalog pages:', requests.slice(-5), 'Page errors:', pageErrors,
    'Visible state:', (await main.innerText({ timeout: 500 }).catch(() => '')).slice(0, 420));
  throw error;
} finally {
  await browser.close();
}
