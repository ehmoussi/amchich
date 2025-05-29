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
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true,
    });
    const names: LLMID[] = [];
    for await (const model of await client.models.list({ signal: signal })) {
        names.push(model.id);
    }
    return names;
}


