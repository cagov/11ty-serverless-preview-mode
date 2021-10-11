// @ts-check
const fetch = require('fetch-retry')(require('node-fetch/lib'), { retries: 3, retryDelay: 2000 });

/**
 * The folder name to place the generated server handler.  Must be added to .gitignore.
 */
const serverlessFunctionFolderName = "preview-mode-auto-generated";
const eleventySinglePagePath = "/GeneratePreviewModePath";
const { EleventyServerlessBundlerPlugin } = require("@11ty/eleventy");
/** @type WordpressPostRow */
const digestPageJSON = require('./digestPageJson.json');

/**
* Callback function to start mapping Wordpress data to an 11ty item
* @callback WordpressSettingCallback
* @param {*} item the 11ty item ready to render
* @param {WordpressPostRow} jsonData json from Wordpress
* @returns {void}
*/

/**
* Query expected format for preivew mode that includes wordpress settings
* @typedef {object} PreviewModeQuery
* @property {string} [postid]
* @property {WordpressSettings} wordpressSettings
*/

/**
 *  Adds EleventyServerless with simple config for single page rendering
 * @param {import("@11ty/eleventy/src/UserConfig")} eleventyConfig 
 * @param {WordpressSettingCallback} settingFunction
 * @example 
 * module.exports = function (eleventyConfig) {
 *   addPreviewModeToEleventy(eleventyConfig, itemSetterCallback, wordPressSettings);
 */
const addPreviewModeToEleventy = (eleventyConfig, settingFunction) => {
    if (!eleventyConfig) {
        throw new Error('eleventyConfig is required.')
    }
    if (!settingFunction) {
        throw new Error('settingFunction is required.')
    }

    eleventyConfig.addPlugin(EleventyServerlessBundlerPlugin, {
        name: serverlessFunctionFolderName, // The serverless function name from your permalink object
        inputDir: "",
        functionsDir: "", //off the root
        redirects: "", //no redirect handling built in
        copyOptions: {
            filter: ['**/*', '!**']
        } // Filtering out all pages, this still brings in includes
    });

    eleventyConfig.addCollection("myserverless", async function (/** @type { import("@11ty/eleventy/src/TemplateCollection")} */ collection) {
        //Using the addCollection to just be able to exec a loop on eleventy data.  Not actually returning a collection.\
        for (const item of collection.items) {
            const itemData = item.data;
            if (!item.outputPath && itemData.eleventy?.serverless) {
                /** @type {PreviewModeQuery} */
                const query = itemData.eleventy?.serverless.query;
                const jsonData = await getPostJsonFromWordpress(query);

                settingFunction(item, jsonData);

            }
        }

        return [];
    });
}

/**
 * runs serverless eleventy on the default page.  Returns a function response.
 * @param {PreviewModeQuery} queryStringParameters from your function's request `req.query`
 * @returns {Promise<{statusCode:number, headers:{"Content-Type":string},body:string}>} Function response Promise
 * @example context.res = await serverlessHandler(req.query); //Azure FaaS
 */
const serverlessHandler = async queryStringParameters => {
    const path = require('path'); //Path Resolve needed to make plugin mode copy work
    const xpath = path.resolve(".", serverlessFunctionFolderName);
    const serverlessFolder = require(xpath);
    return serverlessFolder.handler({ path: eleventySinglePagePath, queryStringParameters });
};

/**
 * Azure Function handler to render a single 11ty page
 * @param {{req:{headers:{"x-original-url":string},query:*},res:*;done:function}} context Azure Function context
 * @param {WordpressSettings} wordpressSettings Configuration
 * @example
 * const wordpressSettings = {
 *   wordPressSite: "https://live-odi-content-api.pantheonsite.io",
 *   resourceUrl: "https://digital.ca.gov",
 *   previewWordPressTagSlug: 'preview-mode'
 * }
 *
 * module.exports = async function (context) {
 *   await azureFunctionHandler(context, wordpressSettings);
 * }
 */
const azureFunctionHandler = async (context, wordpressSettings) => {
    const req = context.req;
    const originalUrl = (req.headers ? req.headers["x-original-url"] : null) || '/'; //default to root path if no origin url specified
    try {
        /** @type {PreviewModeQuery} */
        const previewModeQuery = { ...req.query, wordpressSettings };

        if (originalUrl === '/') { //digest page
            context.res = await serverlessHandler(previewModeQuery);
        } else {
            /** @type {{id:number;slug:string}[]} */
            let posts = [];

            const targetSlug = originalUrl.replace(/^\//, '').split('?')[0].split('/')[0]; //Remove leading slash and anytime after end of slash
            if (targetSlug.match(/^[a-zA-Z0-9|-]*$/)) {
                const wpApiPage = `${wordpressSettings.wordPressSite}/wp-json/wp/v2/posts?slug=${targetSlug}&per_page=100&orderby=modified&_fields=id,slug&cachebust=${Math.random()}`;
                posts = await fetchJson(wpApiPage)
            }

            if (posts.length) {
                //found a post that matches slug
                previewModeQuery.postid = posts[0].id.toString();
                context.res = await serverlessHandler(previewModeQuery);
            } else if (wordpressSettings.resourceUrl) { // Resource call, proxy the content from the resourceUrl
                const fetchResponse = await fetch(`${wordpressSettings.resourceUrl}${originalUrl}`);
                if (!fetchResponse.ok) {
                    let err = new Error(`${fetchResponse.status} - ${fetchResponse.statusText} - ${fetchResponse.url}`);
                    // @ts-ignore
                    err.httpStatusCode = fetchResponse.status;
                    throw err;
                }
                const body = new Uint8Array(await fetchResponse.arrayBuffer());
                context.res = {
                    isRaw: true,
                    headers: {
                        "content-type": fetchResponse.headers.get('content-type')
                    },
                    body
                };
            } else {
                //resource request not supported
                context.res = {
                    statusCode: 405,
                    body: 'resourceUrl not defined',
                };
            }
        }
    } catch (error) {
        context.res = {
            statusCode: error.httpStatusCode || 500,
            body: JSON.stringify(
                {
                    error: error.message,
                },
                null,
                2
            ),
        };
    }
    if (context.done) context.done();
}

/**
* @typedef {Object} WordpressPostRow Expected POST input when using the Wordpress API - https://developer.wordpress.org/rest-api/reference/posts/
* @property {number} author
* @property {number[]} categories
* @property {string} comment_status "closed"
* @property {{rendered:string}} content
* @property {string} date
* @property {string} date_gmt
* @property {{rendered:string}} excerpt
* @property {number} featured_media
* @property {string} format
* @property {{rendered:string}} guid
* @property {number} id
* @property {string} link
* @property {any[]} meta
* @property {string} modified
* @property {string} modified_gmt
* @property {string} ping_status "closed"
* @property {string} slug
* @property {string} status "publish"
* @property {boolean} sticky
* @property {number[]} tags
* @property {string} template
* @property {{rendered:string}} title
* @property {string} type "post"
* @property {{"wp:term"?:{id:number;link:string;name:string;slug:string;taxonomy:string}[][],"wp:featuredmedia"?:{source_url:string}[],author:{name:string}[]}} [_embedded]
* @property {*} [_links]
*/

/**
* @typedef {Object} WordpressSettings
* @property {string} wordPressSite Full path to Wordpress instance
* @property {string} [resourceUrl] Optional Full path to live site that contains resources for proxy redirection
* @property {string} [previewWordPressTagSlug] Slug to filter to when showing available pages
*/

/**
 * calls fetch and expects a json result.  Error on non-ok status.
 * @param {string} url 
 * @param {*} [opts]
 */
const fetchJson = async (url, opts) => {
    const fetchResponse = await fetch(url, opts);
    if (!fetchResponse.ok) {
        throw new Error(`${fetchResponse.status} - ${fetchResponse.statusText} - ${fetchResponse.url}`);
    }
    return fetchResponse.json();
}

/**
 * @param {PreviewModeQuery} query
 * @returns {Promise<WordpressPostRow>}
 */
const getPostJsonFromWordpress = async query => {
    const { postid, wordpressSettings } = query;

    if (postid) {
        const wpApiPage = `${wordpressSettings.wordPressSite}/wp-json/wp/v2/posts/${postid}?_embed&cachebust=${Math.random()}`;

        return fetchJson(wpApiPage);
    } else { //Digest page
        //Get the tag ID for the tag slug
        let TagFilter = "";
        if (wordpressSettings.previewWordPressTagSlug) {
            const wpTagSearch = `${wordpressSettings.wordPressSite}/wp-json/wp/v2/tags?slug=${wordpressSettings.previewWordPressTagSlug}&_fields=id`;
            const TagId = await fetchJson(wpTagSearch)
                .then((/** @type {{id:number}[]} */ TagResults) => {
                    if (TagResults.length) {
                        return TagResults[0].id;
                    }
                });

            if (!TagId) {
                throw new Error(`Tag slug not found - "${wordpressSettings.previewWordPressTagSlug}"`);
            }
            TagFilter = `tags=${TagId}&`;
        }
        const wpApiPage = `${wordpressSettings.wordPressSite}/wp-json/wp/v2/posts?${TagFilter}per_page=100&orderby=modified&_fields=title,modified,slug&cachebust=${Math.random()}`;

        return fetchJson(wpApiPage)
            .then((/** @type {{title:{rendered:string},modified:string,slug:string}[]} */ previewPosts) => {
                const links = previewPosts.map(x => `<li>${x.modified} - <a href="/${x.slug}">${x.title.rendered}</a></li>`);

                let digestReturn = { ...digestPageJSON };
                if (links.length) {
                    digestReturn.content.rendered = `<ul>${links.join('')}</ul>`;
                    digestReturn.date = previewPosts[0].modified;
                    digestReturn.modified = previewPosts[0].modified;
                } else {
                    digestReturn.content.rendered = 'No content to preview';
                }

                return digestReturn
            });
    }
}

/**
 * Class to return in the default template `previewModePage.njk`
 * @example
 * ---js
require("@cagov/11ty-serverless-preview-mode").previewModeNjkHeader
---
 */
const previewModeNjkHeader = {
    permalink: {
        [serverlessFunctionFolderName]: eleventySinglePagePath
    }
};

module.exports = {
    azureFunctionHandler,
    addPreviewModeToEleventy,
    previewModeNjkHeader
}
