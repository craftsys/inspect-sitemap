/**
 * Inspect sitemap to for any error
 */
export default function inspectSitemap(sitemap: string): Promise<{
  baseUrl: string;
  brokenLinks: Array<{
    link: string;
    parentPage: null | string;
    error?: Error;
    hasSameOriginAsSitemap: boolean;
  }>;
}>;
