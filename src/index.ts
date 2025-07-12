import fetch from "node-fetch";
import { parse } from "node-html-parser";

const MAX_ACTIVE_PAGES = 100;

let checkedUrls: Array<string> = [];
let invalidURls: Array<[url: string, error: Error, parentUrl: string | null]> =
  [];

let BASE_URL = "";

type Options = any;

async function fetchSitemap(url: string): Promise<string> {
  return getPageContent(url).catch((e) => {
    const error = e as Error;
    throw new Error(
      `Unable to access the sitemap at ${url}.
Error: ${error.message}

Please check if your server is running.`
    );
  });
}

export default async function inspectSitemap(
  sitemapUrl: string,
  _options?: Options
) {
  checkedUrls = [];
  invalidURls = [];
  BASE_URL = getBaseUrlFromSiteMap(sitemapUrl);
  let text = await fetchSitemap(sitemapUrl);
  const xml = parse(text);
  let urls = xml.querySelectorAll("urlset loc").map((l) => l.innerText);
  let otherSitemaps = xml
    .querySelectorAll("sitemapindex loc")
    .map((t) => t.innerText);
  let allSitemaps: Array<string> = [sitemapUrl, ...otherSitemaps];

  while (otherSitemaps.length) {
    let newSitemaps: Array<string> = [];
    (await Promise.all(otherSitemaps.map((url) => fetchSitemap(url)))).map(
      (text) => {
        const xml = parse(text);
        // push new locations
        urls = urls.concat(
          xml
            .querySelectorAll("urlset loc")
            .map((l) => l.innerText)
            .filter((url) => urls.indexOf(url) === -1) // only push new ones
        );
        // store new sitemaps
        newSitemaps = newSitemaps.concat(
          xml
            .querySelectorAll("sitemapindex loc")
            .map((l) => l.innerText)
            .filter((url) => allSitemaps.indexOf(url) === -1) // only push new ones
        );
      }
    );
    allSitemaps = allSitemaps.concat(newSitemaps);
    otherSitemaps = newSitemaps;
  }
  if (!urls.length) {
    throw new Error(`Sitemap is empty!! ${sitemapUrl}`);
  }
  await Promise.all(
    urls.map((url) => {
      return checkPageIncludingSubPage(url, null);
    })
  );
  let response: {
    baseUrl: string;
    sitemapUrls: Array<string>;
    allUrls: Array<string>;
    brokenLinks: Array<{
      link: string;
      parentPage: null | string;
      error?: Error;
      hasSameOriginAsSitemap: boolean;
    }>;
  } = {
    baseUrl: BASE_URL,
    brokenLinks: [],
    allUrls: urls,
    sitemapUrls: allSitemaps,
  };
  if (invalidURls.length) {
    for (let i = 0; i < invalidURls.length; i++) {
      const [url, error, parentUrl] = invalidURls[i];
      response.brokenLinks.push({
        link: url,
        parentPage: parentUrl,
        error: error,
        hasSameOriginAsSitemap: url.indexOf(BASE_URL) !== -1,
      });
    }
  }
  return response;
}

async function checkPageIncludingSubPage(
  url: string,
  parentUrl: string | null
) {
  const sanitizedUrl = sanitizeUrl(url, parentUrl);
  if (checkedUrls.indexOf(sanitizedUrl || url) !== -1) {
    return;
  }
  checkedUrls.push(sanitizedUrl || url);
  if (!sanitizedUrl) {
    console.log(`.. Skipped : ${url}`);
    return;
  }
  const pageText = await withPageOpen<string | null>(sanitizedUrl, async () => {
    try {
      const resp = await getPageContent(sanitizedUrl);
      if (!resp) {
        throw new Error(`No response from ${sanitizedUrl}`);
      }
      return resp;
    } catch (e) {
      const error = e as Error;
      invalidURls.push([sanitizedUrl, error, parentUrl]);
      throw e;
    }
  });
  console.log("\x1b[32m%s\x1b[0m", `All Good: ${sanitizedUrl}`);
  if (sanitizedUrl && sanitizedUrl.indexOf(BASE_URL) === -1) {
    console.log("\x1b[2m%s\x1b[0m", `.. Skipped sub-pages : ${sanitizedUrl}`);
    return;
  }
  if (!pageText) return;
  // get all the pages
  const hrefs = getLinksFromHTMLText(pageText);
  if (hrefs && hrefs.length) {
    console.log(
      "\x1b[35m%s\x1b[0m",
      `${hrefs.length} link${hrefs.length > 1 ? "s" : ""} on : ${sanitizedUrl}`
    );
    await Promise.all(
      hrefs.map((href) => checkPageIncludingSubPage(href, sanitizedUrl))
    );
  }
}

let activePagesCount = 0;

async function withPageOpen<T>(
  url: string,
  handlePage: () => Promise<T>
): Promise<T | null> {
  if (activePagesCount < MAX_ACTIVE_PAGES) {
    activePagesCount++;
    let handlePageReturnValue = null;
    try {
      handlePageReturnValue = await handlePage();
    } catch (error) {}
    activePagesCount--;
    return handlePageReturnValue;
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(withPageOpen(url, handlePage));
    }, 100);
  });
}

async function getPageContent(url: string) {
  return fetch(url)
    .then((resp) => {
      if (resp.ok) {
        // res.status >= 200 && res.status < 300
        return resp;
      } else {
        throw new Error(resp.statusText);
      }
    })
    .then((resp) => resp.text());
}

function getLinksFromHTMLText(htmlText: string): Array<string> {
  try {
    const dom = parse(htmlText);
    // remove all the templates
    const templates = dom.querySelectorAll("template");
    templates.forEach((template) => template.remove());
    const anchorElms = dom.querySelectorAll("a");
    if (!anchorElms) return [];
    const urls = anchorElms.map((a) => a.getAttribute("href"));
    return urls.filter((link): link is string => Boolean(link));
  } catch (e) {
    return [];
  }
}

/**
 * Sanitize a given url
 * @param {string} url Url to sanitize
 * @param {string} parentUrl Parent url used for relative (starts without slash)
 * @return {string|null}
 */
function sanitizeUrl(url: string, parentUrl?: string | null): string | null {
  if (!parentUrl) {
    parentUrl = BASE_URL;
  }
  if (!isUrlInsepctable(url)) {
    return null;
  }
  if (!url.startsWith("http")) {
    if (url.startsWith("/")) {
      // "/about" => "http://localhost/about"
      url = `${BASE_URL}${url}`;
    } else {
      // parentUrl == "http://localhost/legal"
      // "terms" => "http://localhost/parentUrl/terms"
      if (parentUrl.endsWith("/")) {
        url = `${parentUrl}${url}`;
      } else {
        url = `${parentUrl}/${url}`;
      }
    }
  }
  // remove #hash
  return url.replace(/#.*$/g, "").replace(/\?.*$/g, "");
}

function isUrlInsepctable(url: string): boolean {
  if (
    url.startsWith("tel") ||
    url.startsWith("sms") ||
    url.startsWith("mailto") ||
    url.indexOf("javascript:void") !== -1
  ) {
    return false;
  }
  return true;
}

function getBaseUrlFromSiteMap(sitemapUrl: string) {
  if (!sitemapUrl.startsWith("http")) {
    throw new Error("Sitemap url is invalid. MUST start with http orhttps");
  }
  const isHttps = sitemapUrl.startsWith("https");
  let sitemapWithoutProtocolAndQuery = sitemapUrl
    .replace(/^https?:\/\//i, "")
    .replace(/[#?].*/g, "");
  const firstSlashIndex = sitemapWithoutProtocolAndQuery.indexOf("/");
  if (firstSlashIndex !== -1) {
    sitemapWithoutProtocolAndQuery = sitemapWithoutProtocolAndQuery.slice(
      0,
      firstSlashIndex
    );
  }
  let domain = `http${isHttps ? "s" : ""}://${sitemapWithoutProtocolAndQuery}`;
  return domain;
}
