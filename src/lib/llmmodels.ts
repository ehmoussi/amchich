import { getCloudflareToken } from "./cloudflaretoken";
import { createModel, setModels, type LLMID, type LLMModel } from "./db";


export async function updateAvailableModels(signal: AbortSignal) {
    const models: LLMModel[] = [];
    const ollamaModelNames = await fetchOllamaModels(signal);
    for (const name of ollamaModelNames) {
        models.push(createModel(name, "Ollama"));
    }
    const openRouterModelNames = await fetchOpenRouterModels(signal);
    for (const name of openRouterModelNames) {
        models.push(createModel(name, "OpenRouter"));
    }
    await setModels(models);
}

async function fetchOllamaModels(signal: AbortSignal): Promise<LLMID[]> {
    const names: LLMID[] = [];
    if (import.meta.env.PROD) return [];
    const response = await fetch("http://localhost:11434/api/tags", {
        method: "GET",
        signal
    });
    const data = await response.json();
    for (const model of data.models) {
        names.push(model.name);
    }
    return names;
}


async function fetchOpenRouterModels(signal: AbortSignal): Promise<LLMID[]> {
    const names: LLMID[] = [];
    const response = await fetch(
        "https://openrouter.ai/api/v1/models",
        {
            method: "GET",
            signal
        }
    );
    const data = await response.json();
    for (const model of data.data) {
        if (model.architecture.output_modalities.includes("text")) {
            names.push(model.id);
        }
    }
    return names;
}


export async function getOpenRouterExpense(): Promise<{ usage: number, total: number }> {
    const token = getCloudflareToken();
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/openrouter/expense`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    return await response.json();
}
