# Eleventy serverless preview mode #

Render a single 11ty page using data from your Wordpress API endpoint.  

If you have content in Wordpress for your Eleventy (11ty) site, you can create a Function as a Service (FaaS) function that will render Wordpress content without having to save it anywhere (serverless).

## Features ##
- Single-page 11ty rendering of content retrieved from your Wordpress API data source.
- Digest page for all pages that match a specific Wordpress tag ID.
- Easy Azure FaaS integration

## User experience ##
1. Content editor edits and saves a Wordpress post.
1. Content editor navigates to the preview mode endpoint.
1. Content editor selects a post from the list of preview ready posts.
1. Content editor views fully rendered content.

## Sample navigation ##
- `https://[my-function-url]/` - Digest page.  Display a list of the most recently updates posts (up to 100).  Can also be set to filter for a specific tag (ex `preview`).
- `https://[my-function-url]/myfile.jpg` - Resource request.  Will download and then make available by proxy content from the main site (`https://[real-url]/myfile.jpg`).  This allows for CSS and other content can be sent to the browser as relative links.
- `https://[my-function-url]/?postid=123`, `https://[my-function-url]/?postslug=my-page` - Render requests.  Will render the page using 11ty with Wordpress content from post #123.
## Assumptions ##
- End users are using Wordpress to edit content.
- Your project is using `wordpress-to-github` (Coming soon) or similiar tool for deploying Wordpress content to an 11ty project.

## Eleventy setup ##
Use your existing 11ty build to provide all the template work required to render your preview.

This package requires functionality available in Eleventy v1.0.0 - https://www.11ty.dev/docs/plugins/serverless/

### Preview mode page template ###
Define a page in your 11ty input templates to customize how your pages are rendered.

Add this to your 11ty input folder (ex. `pages`) with the `.njk` extention (ex. `previewModePage.njk`).  

#### **`pages\previewModePage.njk`** ####
```js
---js
require("@cagov/11ty-serverless-preview-mode").previewModeNjkHeader
---
```

### Connecting to the 11ty configuration ###
Connect the 11ty build to the handler service.  At build time, an auto generated folder called `preview-mode-auto-generated` will be created.

#### **`.eleventy.js`** ####
```javascript
const { addPreviewModeToEleventy } = require("@cagov/11ty-serverless-preview-mode");
const wordPressSettings = {
  wordPressSite: "https://live-odi-content-api.pantheonsite.io", //Wordpress endpoint
  previewWordPressTagSlug: 'preview-mode' // optional filter for digest list of preview in Wordpress
}

/**
 * @type {import('@cagov/11ty-serverless-preview-mode').WordpressSettingFunction}
 */
const itemSetterCallback = (item, jsonData) => {
  let featuredMedia = jsonData._embedded["wp:featuredmedia"];

  //Customize for your templates
  item.data.layout = 'page.njk';
  item.data.tags = ['news'];
  item.data.addtositemap = false;
  item.data.title = jsonData.title.rendered;
  item.data.publishdate = jsonData.date.split('T')[0]; //new Date(jsonData.modified_gmt)
  item.data.meta = jsonData.excerpt.rendered;
  item.data.description = jsonData.excerpt.rendered;
  item.data.lead = jsonData.excerpt.rendered;
  item.data.author = jsonData._embedded.author[0].name;
  item.data.previewimage = featuredMedia ? featuredMedia[0].source_url : "img/thumb/APIs-Blog-Postman-Screenshot-1.jpg";

  item.template.frontMatter.content += jsonData.content.rendered;
}

module.exports = function(eleventyConfig) {
  addPreviewModeToEleventy(eleventyConfig, itemSetterCallback, wordPressSettings);
  //...
}
```

### Git ignore ###
When your run your 11ty build locally, you don't want to save the generated output (`preview-mode-auto-generated`) to your repo.
#### **`.gitignore`** ####
```php
# 11ty serverless generated folder
/preview-mode-auto-generated
```

## Setting up with Azure Function as a Service (FaaS) ##

Using Azure FaaS, the service can render posts from remote content, while redirecting all other resource requests (.css, .png, etc) back to the real web server.  Any request without `?postid=` will be considered a forwarded resource request.  Requests without any path will render a digest page showing all the available preview pages that match a tag id.

### Azure function source ###
The package has a complete handler for Azure FaaS - `azureFunctionHandler`.  Include the url for your live web site to allow resource request forwarding.
#### **`yourFunction\index.js`** ####
```javascript
const { azureFunctionHandler } = require("@cagov/11ty-serverless-preview-mode");
module.exports = async function (context) {
  await azureFunctionHandler(context, "https://digital.ca.gov");
}
```
#### **`yourFunction\function.json`** ####
Trap ALL routes for your functions to support resource forwarding.  Set `route` like this...
```json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": [
        "get"
      ],
      "route": "{*routes}"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```
#### **`host.json`** ####
Set `routePrefix` to blank in the `host.json` file in your Azure function project root.
```json
{
  "extensions": {
      "http": {
          "routePrefix": ""
      }
  }
}
```

## References ##
This package is available on NPM at https://www.npmjs.com/package/@cagov/11ty-serverless-preview-mode