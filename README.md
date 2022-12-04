# Inspect Sitemap for any Issues


When adding links of different pages e.g. terms and privacy pages, social media links etc., we may accidently mistype the link. This occurs very often when a web page contains a lot of content with some links e.g. terms and privacy pages, blogs, documentation and help pages etc.


```html
<!-- Mistyped `/contract` with `/contact` -->
<a href="/contact"></a>
<!-- Should have been <a href="/contract"></a> -->

<!-- Page migrated from `/privacy` to `/legal/privacy` but we forgot to update it on some places -->
<a href="/legal"></a>
<!-- Should have been <a href="/privacy/legal"></a> -->
```

This package was created to inspect any broken links. Given a [sitemap](https://en.wikipedia.org/wiki/Site_map) (xml file), it will scan all the pages from this file and will scan all the links found on the any pages recursively to ensure no broken links exists.

If you have some links to external resources (not hosted on your domain/origin e.g. social media pages, your own other services etc), these external pages will NOT be scanned recursively (only scan the page and don't scan links on these pages) for broken links.

## Prerequisite

- `node > 10`

If you just want to try it out for your project's website, execute following command in you terminal

```
npx inspect-sitemap https://yoursite.com/yoursitemap.xml
```

## Installation

If you want to use this package during your project development, you should install it as a npm dependency and test your side during development. 

```
npm install --save-dev inspect-sitemap
```

## Usage

### Using CLI


```json
{
  "scripts": {
    "test": "inspect-sitemap http://localhost:8080/sitemap.xml"
  }
}
```

> NOTE: Make sure that the server (localhost:8080 in this case) is running when the tests are executing

### Using inside your tests

You can also use this inside your existing tests to ensure your sitemap is correct.

> NOTE: Make sure that the server (localhost:8080 in this case) is running when the tests are executing

```js
import inspectSitemap from "inspect-sitemap"

it("Has valid sitemap", async () => {
  expect.assertions(1)
  const response = await inspectSitemap("http://localhost:8080/sitemap.xml")
  expect(response.brokenLinks).toHaveLength(0)
})
```

**Important**

Some social media platforms blocks the request assuming it as a bot requests. These links will be included inside the `brokenLinks` array returned by `inspectSitemap`. If you are sure that these urls are correct, you should filterout these links.

```js
import inspectSitemap from "inspect-sitemap"

const validLinks = ["https://linkedin.com/mycompany"]

it("Has valid sitemap", async () => {
  expect.assertions(1)
  const response = await inspectSitemap("http://localhost:8080/sitemap.xml")
  expect(
    response.brokenLinks
      .filter(({ link }) => validLinks.indexOf(link) === -1)
  ).toHaveLength(0)
})
```
It may be helpful to ignore broken links which are not hosted on our domain. For this reason, items in `brokenLinks` array include a boolean property `hasSameOriginAsSitemap`. This property will be set to `true` for links that are on the same origin as the sitemap.

```js
import inspectSitemap from "inspect-sitemap"

it("Has valid sitemap", async () => {
  expect.assertions(1)
  const response = await inspectSitemap("http://localhost:8080/sitemap.xml")
  // Ensure NO broken links on the same origin
  expect(
    response.brokenLinks
      .filter(({ link }) => link.hasSameOriginAsSitemap)
  ).toHaveLength(0)
})
```

## Running in CI

We can use [start-server-and-test](https://www.npmjs.com/package/start-server-and-test) to

- Start Server
- Wait for URL
- Run Tests
- Shut down server on tests end

Install the following dependencies if you haven't already.

```sh
npm install --save-dev inspect-sitemap start-server-and-test
```

**Assuming**

- you can build your site with `npm run build`
- host locally it using `npm run serve:build` on port 8080

Add the following script to your `package.json` file. You should update these script according to your setup.

```json
{
  "scripts": {
    "test": "inspect-sitemap http://localhost:8080/sitemap.xml",
    "test:ci": "npm run build && start-server-and-test serve:build http://localhost:8080 test"
  }
}
```

Now you can execute this insite your ci with `npm run test:ci`. 

### Static Sites

If you have a static site in a directory, you can use [serve](https://www.npmjs.com/package/serve) to serve the directory locally.

```sh
npm install --save-dev serve
```
Assuming your build output directory is `dist`. Please update accordingly if needed.

```json
{
  "scripts": {
    "serve:build": "serve -d dist -p 8080"
  }
}
```


## Licence

MIT


## Contribution

Any issues and PRs are welcomed. When opening an issue, please provide as much information as you can to help us reproduce the issue on our end.
