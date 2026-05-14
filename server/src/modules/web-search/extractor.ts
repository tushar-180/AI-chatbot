import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const TIMEOUT_MS = 8000;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const ENABLE_LOGS = process.env.WEB_SEARCH_DEBUG === "true";

function log(event: string, data: any) {
    if (!ENABLE_LOGS) return;

    console.log(
        JSON.stringify({
            event: `extractor:${event}`,
            time: Date.now(),
            ...data,
        }),
    );
}

export type ExtractedPage = {
    url: string;
    title: string;
    text: string;
    excerpt?: string;
    length: number;
    byline?: string | null;
    published?: string | null;

    failed?: boolean;
    fallback?: boolean;
};

/**
 * MAIN ENTRY
 */
export async function extractPage(url: string, meta?: { score?: number }) {
    log("start", {
        url,
        rerankerScore: meta?.score ?? null,
    });

    try {
        const html = await fetchHtml(url);

        log("fetched", {
            url,
            htmlLength: html.length,
            rerankerScore: meta?.score ?? null,
        });

        const primary = extractWithReadability(html, url);

        if (primary && primary.text.length >= 120) {
            log("success", {
                url,
                method: "readability",
                length: primary.text.length,
                rerankerScore: meta?.score ?? null,
            });

            return primary;
        }

        const fallback = fallbackExtract(html, url);

        log("fallback", {
            url,
            length: fallback.text.length,
            rerankerScore: meta?.score ?? null,
        });

        return fallback;
    } catch (err) {
        log("error", {
            url,
            error: String(err),
            rerankerScore: meta?.score ?? null,
        });

        return {
            url,
            title: "",
            text: "",
            length: 0,
            failed: true,
            fallback: true,
        };
    }
}

/**
 * HTTP FETCH LAYER (controlled, replace library fetch)
 */
async function fetchHtml(url: string): Promise<string> {
    const res = await axios.get(url, {
        timeout: TIMEOUT_MS,
        headers: HEADERS,
        maxRedirects: 5,
        responseType: "text",
    });

    return typeof res.data === "string" ? res.data : String(res.data || "");
}

/**
 * PRIMARY EXTRACTOR (Readability)
 */
function extractWithReadability(
    html: string,
    url: string,
): ExtractedPage | null {
    try {
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article?.textContent) return null;

        const text = normalize(article.textContent);

        return {
            url,
            title: article.title || "",
            text,
            excerpt: text.slice(0, 1000),
            length: text.length,
            byline: article.byline || null,
            published: null,
            failed: false,
            fallback: false,
        };
    } catch {
        return null;
    }
}

/**
 * FALLBACK EXTRACTOR (deterministic, no dependencies)
 */
function fallbackExtract(html: string, url: string): ExtractedPage {
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<header[\s\S]*?<\/header>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return {
        url,
        title: "",
        text: text.slice(0, 12000),
        excerpt: text.slice(0, 1000),
        length: text.length,
        failed: true,
        fallback: true,
    };
}

function normalize(text: string) {
    return text.replace(/\n+/g, "\n").replace(/\s+/g, " ").trim();
}
