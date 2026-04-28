const path = require('node:path');
const { expect, test } = require('@playwright/test');

const docsPages = [
  'index.html',
  'getting-started.html',
  'replay-cli.html',
  'replay-jobs.html',
  'replay-api.html',
  'replay-ui.html',
  'architecture.html',
  'operations.html',
  'mvp-acceptance.html',
  'roadmap.html',
];

const viewportWidths = [320, 375, 768, 920];

function docsPageUrl(fileName) {
  return `file:///${path.resolve('site', fileName).replace(/\\/g, '/')}`;
}

test.describe('GitHub Pages documentation', () => {
  test('does not create horizontal page overflow at mobile and tablet widths', async ({
    page,
  }) => {
    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: 900 });

      for (const docsPage of docsPages) {
        await page.goto(docsPageUrl(docsPage));

        const dimensions = await page.evaluate(() => ({
          bodyScrollWidth: document.body.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
        }));

        expect(dimensions, `${docsPage} at ${width}px`).toMatchObject({
          bodyScrollWidth: dimensions.clientWidth,
          documentScrollWidth: dimensions.clientWidth,
        });
      }
    }
  });
});
