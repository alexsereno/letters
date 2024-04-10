import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";
const parser = new MarkdownIt();

export async function GET(context) {
    const posts = await getCollection("blog");
    return rss({
        stylesheet: "/rss/styles.xsl",

        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        site: context.site,
        items: posts.map((post) => ({
            link: `/${post.slug}/`,
            // Note: this will not process components or JSX expressions in MDX files.
            content: sanitizeHtml(parser.render(post.body), {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
            }),
            ...post.data,
        })),
    });
}
