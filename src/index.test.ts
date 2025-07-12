import inspectSitemap from "./index";
import type FetchMockType from "fetch-mock-jest";
jest.mock("node-fetch", () => require("fetch-mock-jest").sandbox());
import m from "node-fetch";

const fetchMock: typeof FetchMockType = m as any;

beforeEach(() => {
  fetchMock.mockClear();
  fetchMock.mockReset();
});
it("works for valid sitemaps", async () => {
  const validSitemap = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>http://localhost/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
<url>
<loc>http://localhost/about/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
</urlset>`;
  fetchMock.get("http://localhost/sitemap.xml", { body: validSitemap });
  fetchMock.get("http://localhost/", {
    body: `<div><a href="/about/">About</a></div>`,
  });
  fetchMock.get("http://localhost/about/", {
    body: `<div><a href="/">Home Page</a></div>`,
  });
  const resp = await inspectSitemap("http://localhost/sitemap.xml");
  expect(resp.brokenLinks).toHaveLength(0);
});

it("works for linked sitemaps indexes", async () => {
  const validSitemapWithIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>http://localhost/sitemap-0.xml</loc></sitemap>
<sitemap><loc>http://localhost/sitemap-1.xml</loc></sitemap>
</sitemapindex>
`;

  const validSitemap = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>http://localhost/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
<url>
<loc>http://localhost/about/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
</urlset>`;
  fetchMock.get("http://localhost/sitemap.xml", {
    body: validSitemapWithIndex,
  });
  fetchMock.get("http://localhost/sitemap-0.xml", { body: validSitemap });
  fetchMock.get("http://localhost/sitemap-1.xml", { body: validSitemap });
  fetchMock.get("http://localhost/about/", {
    body: `<div><a href="/">Home Page</a></div>`,
  });
  fetchMock.get("http://localhost/", {
    body: `<div><a href="/">Home Page</a></div>`,
  });
  const resp = await inspectSitemap("http://localhost/sitemap.xml");
  expect(resp.brokenLinks).toHaveLength(0);
  expect(resp.sitemapUrls).toHaveLength(3);
  expect(resp.allUrls).toHaveLength(2);
});

it("fails for broken links in sitemap", async () => {
  const validSitemap = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>http://localhost/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
<url>
<loc>http://localhost/about/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
<url>
<loc>http://localhost/contact/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
</urlset>`;
  fetchMock.get("http://localhost/sitemap.xml", { body: validSitemap });
  fetchMock.get("http://localhost/", {
    body: `<div><a href="/about/">About</a></div>`,
  });
  fetchMock.get("http://localhost/about/", {
    body: `<div><a href="/">Home Page</a></div>`,
  });
  fetchMock.get("http://localhost/contact/", 404);
  const resp = await inspectSitemap("http://localhost/sitemap.xml");
  expect(resp.brokenLinks).toHaveLength(1);
});

it("fails for broken links in sub pages", async () => {
  const validSitemap = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>http://localhost/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
<url>
<loc>http://localhost/about/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
</urlset>`;
  fetchMock.get("http://localhost/sitemap.xml", { body: validSitemap });
  fetchMock.get("http://localhost/", {
    body: `<div><a href="/about/">About</a><a href="/contact/">About</a></div>`,
  });
  fetchMock.get("http://localhost/about/", {
    body: `<div><a href="/">Home Page</a></div>`,
  });
  fetchMock.get("http://localhost/contact/", 404);
  const resp = await inspectSitemap("http://localhost/sitemap.xml");
  expect(resp.brokenLinks).toHaveLength(1);
});

it("handles broken sitemap", async () => {
  fetchMock.get("http://localhost/sitemap.xml", 400);
  expect.assertions(1);
  try {
    await inspectSitemap("http://localhost/sitemap.xml");
  } catch (e) {
    expect(e).not.toBeUndefined();
  }
});

it("ignore template tags in html", async () => {
  fetchMock.get("http://localhost/sitemap.xml", {
    body: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>http://localhost/</loc>
<lastmod>2021-01-14</lastmod>
<priority>1.00</priority>
</url>
</urlset>`,
  });
  fetchMock.get("http://localhost/", {
    body: `<div><template><a href="/e404/">About</a></template></div>`,
  });
  fetchMock.get("http://localhost/e404/", 404);
  const resp = await inspectSitemap("http://localhost/sitemap.xml");
  expect(resp.brokenLinks).toHaveLength(0);
});
