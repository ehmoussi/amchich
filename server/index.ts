import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "hono/adapter";
import { proxy } from "hono/proxy";

const OPENAI_URL = "https://api.openai.com/v1"
const port = 3001;
const app = new Hono();

app.use("*", cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", `http://localhost:${port}`],
}));


async function proxyOpenAiReq(c: Context, url: string, apiKey: string) {
    const response = await proxy(url, {
        ...c.req,
        headers: {
            ...c.req.header(),
            Authorization: `Bearer ${apiKey}`,
        },
    });
    response.headers.delete("set-cookie");
    response.headers.delete("x-request-id");
    response.headers.delete("server");
    response.headers.delete("cf-ray");
    response.headers.delete("alt-svc");
    return response;
};

app.all("/api/v1/openai/:p1", async (c) => {
    const { OPENAI_API_KEY: apiKey } = env<{ OPENAI_API_KEY: string }>(c);
    const p1 = c.req.param("p1");
    const url = `${OPENAI_URL}/${p1}`;
    return proxyOpenAiReq(c, url, apiKey);
});

app.get("/api/v1/openai/organization/:p1", async (c) => {
    const { OPENAI_ADMIN_KEY: apiKey } = env<{ OPENAI_ADMIN_KEY: string }>(c);
    const p1 = c.req.param("p1");
    let url = `${OPENAI_URL}/organization/${p1}`;
    const queriesString = new URL(c.req.url).search;
    url += queriesString;
    return proxyOpenAiReq(c, url, apiKey);
});

app.all("/api/v1/openai/:p1/:p2", async (c) => {
    const { OPENAI_API_KEY: apiKey } = env<{ OPENAI_API_KEY: string }>(c);
    const p1 = c.req.param("p1");
    const p2 = c.req.param("p2");
    const url = `${OPENAI_URL}/${p1}/${p2}`;
    return proxyOpenAiReq(c, url, apiKey);
});


serve({ fetch: app.fetch, port });
