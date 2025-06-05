import OpenAI from "openai";
import { createModel, setModels, type LLMID, type LLMModel } from "./db";


export async function updateAvailableModels(signal: AbortSignal) {
    const models: LLMModel[] = [];
    const ollamaModelNames = await fetchOllamaModels(signal);
    for (const name of ollamaModelNames) {
        models.push(createModel(name, "Ollama"));
    }
    const openaiModelNames = await fetchOpenAiModels(signal);
    for (const name of openaiModelNames) {
        models.push(createModel(name, "OpenAI"));
    }
    await setModels(models);
}

async function fetchOllamaModels(signal: AbortSignal): Promise<LLMID[]> {
    const client = new OpenAI({
        baseURL: "http://localhost:11434/v1/",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
    });
    const names: LLMID[] = [];
    for await (const model of await client.models.list({ signal: signal })) {
        names.push(model.id);
    }
    return names;
}



async function fetchOpenAiModels(signal: AbortSignal): Promise<LLMID[]> {
    const client = new OpenAI({
        baseURL: "http://localhost:3001/api/v1/openai",
        apiKey: "dummy",
        dangerouslyAllowBrowser: true,
    });
    const names: LLMID[] = [];
    const models = await client.models.list({ signal: signal });
    for await (const model of models) {
        if (model.owned_by === "system")
            names.push(model.id);
    }
    return names;
}





export async function getOpenAIExpense(): Promise<number> {
    const client = new OpenAI({
        baseURL: "http://localhost:3001/api/v1/openai",
        apiKey: "dummy",
        dangerouslyAllowBrowser: true,
    });
    const now = new Date();
    const firstDayOfTheMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTime = Math.floor(firstDayOfTheMonth.getTime() / 1000);
    const response = await client.request({
        method: "get",
        path: "/organization/costs",
        query: {
            start_time: String(startTime),
            limit: "100",
        },
    }) as any;
    let totalSpent = 0;
    for (const bucket of response.data) {
        for (const item of bucket.results) {
            totalSpent += item.amount.value;
        }
    }
    return totalSpent;
}
