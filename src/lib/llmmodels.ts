import OpenAI from "openai";
import { setModels, type LLMID, type LLMModel } from "./db";


export async function updateAvailableModels(signal: AbortSignal): Promise<LLMModel[]> {
    let names: LLMID[] = [];
    const ollamaModelNames = await fetchOllamaModels(signal);
    names.push(...ollamaModelNames);
    return await setModels(names);
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
