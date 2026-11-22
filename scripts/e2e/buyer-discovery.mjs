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
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: origin, locale: 'en-US', viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const requests = [];
let failNextPage = true;
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
  if (path === '/api/concerts') {
    const number = Number(url.searchParams.get('page'));
    requests.push(number);
    if (number === 0 && catalogDelay) await catalogDelay;
    if (number > 0 && failNextPage) {
      failNextPage = false;
      return reply(null, 503);
    }
    const all = [...firstPage, ...nextPage];
    const size = Number(url.searchParams.get('size'));
    const totalPages = Math.ceil(all.length / size);
    const content = all.slice(number * size, (number + 1) * size);
    return reply({ content, number, size, totalElements: all.length, totalPages, last: number >= totalPages - 1 });
  }
  if (path === '/api/concerts/rare') {
    return reply({ ...nextPage[1], description: 'Fixture show', ticketTypes: [] });
  }
  if (path.endsWith('/ticket-types')) return reply([]);
  return reply(null, 404);
});

const main = page.getByRole('main');
const results = () => main.getByRole('region', { name: /Upcoming events|Search results|Sự kiện sắp tới|Kết quả tìm kiếm/i });

try {
  await page.goto('/');
  await main.getByRole('heading', { name: 'Find your next live event' }).waitFor();
  const search = main.getByRole('searchbox', { name: 'Search events' });
  const searchBounds = await search.boundingBox();
  assert(searchBounds && searchBounds.y < 500, 'Search is visible immediately at mobile width.');
  assert.equal(await main.getByText('City', { exact: true }).count(), 0, 'Fixture fields do not ship on the public route.');
  const openingSoon = results().getByRole('link', { name: 'Sunrise Jazz' });
  await openingSoon.getByText('Coming soon', { exact: true }).waitFor();
  const comingSoon = results().getByRole('region', { name: 'Coming soon', exact: true });
  assert(await comingSoon.getByRole('link', { name: 'Sunrise Jazz' }).isVisible());
  assert.equal(await comingSoon.getByText('On sale', { exact: true }).count(), 0);
  await results().getByRole('button', { name: 'Load more events' }).click();
  await results().getByText('Could not load more events.').waitFor();
  assert(await openingSoon.isVisible(), 'A failed page keeps the previously loaded results.');

  await search.fill('dat phong');
  await search.press('Enter');
  await results().getByText('No matches in loaded events').waitFor();
  await results().getByRole('button', { name: 'Try again' }).click();
  await results().getByRole('button', { name: 'Load more events' }).click();
  await results().getByText('No events match these filters.').waitFor();
  assert(requests.filter((value) => value === 1).length >= 2, 'Retry fetches the failed page.');

  await search.fill('dem nhac dai duong');
  await search.press('Enter');
  await results().getByRole('link', { name: /Late Night Orchestra/ }).waitFor();
  await search.fill('nha hat hoa binh');
  await search.press('Enter');
  const rare = results().getByRole('link', { name: /Rare Starlight Symphony/ });
  await rare.waitFor();
  await rare.click();
  await main.getByRole('heading', { name: 'Rare Starlight Symphony' }).waitFor();
  await page.goBack();
  await rare.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'nha hat hoa binh');
  await search.fill('');
  await search.press('Enter');
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
    return link && Math.abs(link.getBoundingClientRect().top - top) < 24;
  }, before);
  assert.equal(await rare.evaluate((node) => node === document.activeElement), true);

  await page.goto('/?status=DRAFT');
  await results().getByRole('link', { name: /Sunrise Jazz/ }).waitFor();
  assert.equal(await results().getByRole('link', { name: /Chamber Night/ }).count(), 0);
  await page.goto('/?status=' + encodeURIComponent('Sắp mở bán'));
  await results().getByRole('link', { name: /Sunrise Jazz/ }).waitFor();

  const filterDisclosure = results().locator('summary');
  await filterDisclosure.focus();
  await page.keyboard.press('Enter');
  await results().getByRole('combobox', { name: 'Event date', exact: true }).selectOption('today');
  await results().getByRole('button', { name: 'Apply filters' }).click();
  assert.equal(new URL(page.url()).searchParams.get('date'), 'today');
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
  assert.equal(new URL(page.url()).searchParams.get('from'), localDay);
  assert.equal(new URL(page.url()).searchParams.get('to'), localDay);
  await results().getByRole('link', { name: /Sunrise Jazz/ }).waitFor();
  await page.reload();
  await results().getByRole('link', { name: /Sunrise Jazz/ }).waitFor();


  for (const language of ['en', 'vi']) {
    await page.evaluate((value) => localStorage.setItem('ticketbox.language', value), language);
    await page.goto('/');
    await main.getByRole('heading', { name: /Chamber Night|Đêm nhạc thính phòng/ }).waitFor();
    assert.equal(await results().getByRole('link', { name: /Chamber Night|Đêm nhạc thính phòng/ }).count(), 0);
    await results().getByRole('link', { name: 'Sunrise Jazz' }).waitFor();
    for (const width of [320, 390, 834, 1440, 2560]) {
      await page.setViewportSize({ width, height: 924 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 1, `${language} at ${width}px overflows by ${overflow}px`);
      if (width === 2560) {
        const bounds = await page.locator('.discovery-page').boundingBox();
        assert(bounds.width > width * .85, 'Discovery uses most of a wide display.');
      }
      if (process.env.TICKETBOX_DISCOVERY_SCREENSHOTS) {
        await page.screenshot({ path: `${process.env.TICKETBOX_DISCOVERY_SCREENSHOTS}/discovery-${language}-${width}.png` });
      }
    }
  }

  await page.evaluate(() => localStorage.setItem('ticketbox.language', 'en'));
  let releaseCatalog;
  catalogDelay = new Promise((release) => { releaseCatalog = release; });
  await page.goto('/?q=not-in-catalog#discover-concerts', { waitUntil: 'domcontentloaded' });
  await search.fill('a new search in progress');
  releaseCatalog();
  catalogDelay = undefined;
  await results().getByText('No matches in loaded events').waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await search.evaluate((node) => node === document.activeElement), true, 'Delayed hash scrolling preserves active input.');
  assert.equal(await search.inputValue(), 'a new search in progress');

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
    'Catalog pages requested:', requests, 'Visible state:', (await main.innerText()).slice(0, 420));
  throw error;
} finally {
  await browser.close();
}
