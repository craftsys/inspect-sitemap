import fetch from "node-fetch";
import { parse } from "node-html-parser";

const MAX_ACTIVE_PAGES = 100;

const checkedUrls: Array<string> = [];
const invalidURls: Array<
  [url: string, error: Error, parentUrl: string | null]
> = [];

let BASE_URL = "";

type Options = any;

export default async function inspectSitemap(
  sitemapUrl: string,
  _options?: Options
) {
  BASE_URL = getBaseUrlFromSiteMap(sitemapUrl);
  let text = "";
  try {
    text = await getPageContent(sitemapUrl);
  } catch (e) {
    throw new Error(
      `Unable to access the sitemap at ${sitemapUrl}.
Error: ${e.message}

Please check if your server is running.`
    );
  }
  const xml = parse(text);
  const locs = xml.querySelectorAll("loc");
  const urls = locs.map((loc) => loc.innerText);
  if (!urls.length) {
    throw new Error(`Sitemap is empty!! ${sitemapUrl}`)
  }
  await Promise.all(
    urls.map((url) => {
      return checkPageIncludingSubPage(url, null);
    })
  );
  let response: {
    baseUrl: string;
    brokenLinks: Array<{
      link: string;
      parentPage: null | string;
      error?: Error;
      hasSameOriginAsSitemap: boolean;
    }>;
  } = {
    baseUrl: BASE_URL,
    brokenLinks: [],
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
      invalidURls.push([sanitizedUrl, e, parentUrl]);
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
    console.log("\x1b[35m%s\x1b[0m", `${hrefs.length} link${hrefs.length > 1 ? "s" : ""} on : ${sanitizedUrl}`);
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
    } catch (error) {
    }
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
    const xml = parse(htmlText);
    const anchorElms = xml.querySelectorAll("a");
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
  return url.replace(/#.*$/g, "")
      .replace(/\?.*$/g, "");
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
