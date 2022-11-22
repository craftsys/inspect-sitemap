#!/usr/bin/env node
import inspectSitemap from "../index";

const [, , ...args] = process.argv;

if (args.length) {
  const sitemap: string = args[0];
  console.log(`Inspecting sitemap from ${sitemap}...`);
  const options = parseOptions(args);
  (async () => {
    try {
      const { brokenLinks, baseUrl } = await inspectSitemap(sitemap, options);
      if (brokenLinks.length === 0) {
        console.log("\x1b[32m%s\x1b[0m", "\nAll links working\n");
        return;
      }
      let urlsWithMajorIssue = [];
      for (let {
        link,
        parentPage,
        error,
        hasSameOriginAsSitemap,
      } of brokenLinks) {
        if (!hasSameOriginAsSitemap) {
          // this page is not hosted on this page
          // can be ignored
          console.log(
            "\x1b[33m%s\x1b[0m",
            `${link} [parent: ${parentPage || baseUrl}]\n   ==> ${
              (typeof error === "string" ? error : error?.message) || ""
            }`
          );
        } else {
          urlsWithMajorIssue.push({ link, parentPage, error });
        }
      }
      if (urlsWithMajorIssue.length) {
        console.log("\n\n---------------");
        console.log(
          "\x1b[31m%s\x1b[0m",
          `Following urls have issues. These are from your own domain "${baseUrl}" and must be fixed.\n`
        );
        for (let { link, parentPage, error } of urlsWithMajorIssue) {
          console.log(
            "\x1b[31m%s\x1b[0m",
            `${link} [parent: ${parentPage || baseUrl}]\n   ==> ${
              (typeof error === "string" ? error : error?.message) || ""
            }`
          );
        }
        throw new Error("Broken links in sitemap.");
      }
    } catch (e) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        (e.message || "Something went wrong") + "\n"
      );
      // something went wrong
      process.exit(1);
    }
  })();
} else {
  process.stderr.write(
    "Please provide the url of sitemap e.g. http://localhost:8080/sitemap.xml"
  );
}

function parseOptions(args: Array<string>) {
  let options: { [key: string]: any } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let key, value;
    let m: RegExpMatchArray | null;
    switch (true) {
      case /^--.+=/.test(arg):
        // when --options=value
        m = arg.match(/^--([^=]+)=([\s\S]*)$/);
        if (m) {
          key = m[1];
          value = m[2];
          options[key] = value;
        }
        break;
      case /^--.+/.test(arg):
        // when --options value
        m = arg.match(/^--(.+)/);
        if (m) {
          key = m[1];
          value = args[i + 1];
          options[key] = value;
        }
        break;
      default:
        break;
    }
  }
  return options;
}
