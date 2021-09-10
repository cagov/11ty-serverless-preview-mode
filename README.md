# Eleventy serverless preview mode #

Render a single 11ty page using data from your Wordpress API endpoint.  

If you have content in Wordpress for your eleventy site, you can create a Function as a Service (FaaS) function that will render content for preview right out of Wordpress.

## Features
- Single page 11ty rendering of content retrieved from your Wordpress API data source.
- Digest page for all pages that match a specific Wordpress tag ID.
- Easy Azure FaaS integration

## Eleventy setup ##

Use your existing 11ty build to provide all the template work needed to render your preview.

### Preview mode page template ###
You will need to have a single page in your 11ty input templates to customize how your pages are rendered.

Add this to your 11ty input folder (ex. `pages`) with the `.11ty.js` extention (ex. `previewModePage.11ty.js`).  

#### pages\previewModePage.11ty.js ####
```javascript
const { addPreviewModeDataElements, getPostJsonFromWordpress } = require("@cagov/11ty-serverless-preview-mode");

const wordPressSettings = {
    wordPressSite: "https://live-odi-content-api.pantheonsite.io", //Wordpress endpoint
    previewWordPressTagId: 20 //your preview-mode tag id in Wordpress
}

class previewModePageClass {
    async data() {
        return {
            layout: "page", //Or whatever layout the preview page should have
            tags: ["news"], //Or whatever tags the preview page should have
            ...addPreviewModeDataElements()
        };
    }

    async render(itemData) {
        const jsonData = await getPostJsonFromWordpress(itemData, wordPressSettings);

        //Customize for you templates here

        let featuredMedia = jsonData._embedded["wp:featuredmedia"];
        itemData.title = jsonData.title.rendered;
        itemData.publishdate = jsonData.date.split('T')[0]; //new Date(jsonData.modified_gmt)
        itemData.meta = jsonData.excerpt.rendered;
        itemData.description = jsonData.excerpt.rendered;
        itemData.lead = jsonData.excerpt.rendered;
        itemData.author = jsonData._embedded.author[0].name;
        itemData.previewimage = featuredMedia ? featuredMedia[0].source_url : "img/thumb/APIs-Blog-Postman-Screenshot-1.jpg";

        return jsonData.content.rendered;
    }
}

module.exports = previewModePageClass;
```

### Adding to Eleventy configuration ###
You will need to tell your Eleventy build the handler service.  At build time, an auto generated folder called `preview-mode-auto-generated` will be created.

#### .eleventy.js ####
```javascript
module.exports = function(eleventyConfig) {
//...
  const { addPreviewModeToEleventy } = require("@cagov/11ty-serverless-preview-mode");
  addPreviewModeToEleventy(eleventyConfig);
//...
  
```

### Git ignore ###
When your run your 11ty build locally, you don't want to save the generated output (`preview-mode-auto-generated`) to your repo.
#### .gitignore ####
```php
# 11ty serverless generated folder
/preview-mode-auto-generated
```

## Setting up with Azure Function as a Service (FaaS) ##

Using Azure FaaS, the service can render a single page from remote content, while redirecting all other resource requests (.css, .png, etc) back to the real web server.  Any request without `?postid=` will be considered a forwarded resource request.  Requests without any path will render a digest page showing all the available preview pages that match a tag id.

### `myFunction\index.js` ###
The service has a complete handler for Azure FaaS - `azureFunctionHandler`.  Include the url for your live service to allow resource request forwarding.
```javascript
const { azureFunctionHandler } = require("@cagov/11ty-serverless-preview-mode");
module.exports = async function (context) {
  await azureFunctionHandler(context, "https://digital.ca.gov");
}
```
### `myFunction\function.json` ###
You will need to trap ALL routes for your functions to support resource forwarding.  Set `route` like this...
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
### `host.json`
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

This package is available on NPM at https://www.npmjs.com/package/@cagov/11ty-serverless-preview-mode
