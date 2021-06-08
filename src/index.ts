import fetch from "node-fetch";
import cliProgress, { SingleBar } from "cli-progress";
import { parse } from "node-html-parser";
import _colors from "colors";

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
  await Promise.all(
    urls.map((url) => {
      return checkPageIncludingSubPage(url, null);
    })
  );
  closeAllPage();
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
    logInfo(url, `Skipped`);
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
  if (sanitizedUrl && sanitizedUrl.indexOf(BASE_URL) === -1) {
    logInfo(sanitizedUrl, `Skipped sub-page`);
    return;
  }
  if (!pageText) return;
  // get all the pages
  const hrefs = getLinksFromHTMLText(pageText);
  if (hrefs && hrefs.length) {
    logInfo(
      sanitizedUrl,
      `${hrefs.length} link${hrefs.length > 1 ? "s" : ""} on`
    );
    await Promise.all(
      hrefs.map((href) => checkPageIncludingSubPage(href, sanitizedUrl))
    );
  }
}

type Page = {
  url: null | string;
  bar: SingleBar;
};

const pages: Array<Page> = [];
// create new container
const multibar = new cliProgress.MultiBar({
  forceRedraw: true,
  format: (_options, _params, payload) => {
    return `${payload.status} : ${payload.url}`;
  },
});

function logInfo(url: string, info: string) {
  const bar = multibar.create(1, 1, { url: url, status: _colors.dim(info) });
  pages.push({
    bar,
    url: url,
  });
}

function closeAllPage() {
  for (let page of pages) {
    page.bar.stop();
  }
  multibar.stop();
}

let activePagesCount = 0;

async function withPageOpen<T>(
  url: string,
  handlePage: () => Promise<T>
): Promise<T | null> {
  if (activePagesCount < MAX_ACTIVE_PAGES) {
    activePagesCount++;
    const page: Page = {
      bar: multibar.create(1, 0, { url, status: "Checking..." }),
      url: url,
    };
    pages.push(page);
    let handlePageReturnValue = null;
    try {
      handlePageReturnValue = await handlePage();
      page.bar.update(1, {
        url: url,
        status: _colors.green("All Good"),
      });
    } catch (error) {
      page.bar.update(1, {
        url: url,
        status: _colors.red("Failed  "),
      });
    }
    page.url = null;
    page.bar.stop();
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
  return url.replace(/#.*$/g, "");
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
