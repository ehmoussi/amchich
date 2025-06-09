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
    const openRouterModelNames = await fetchOpenRouterModels(signal);
    for (const name of openRouterModelNames) {
        models.push(createModel(name, "OpenRouter"));
    }
    await setModels(models);
}

async function fetchOllamaModels(signal: AbortSignal): Promise<LLMID[]> {
    const names: LLMID[] = [];
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



async function fetchOpenAiModels(signal: AbortSignal): Promise<LLMID[]> {
    const names: LLMID[] = [];
    const response = await fetch(
        "http://localhost:3001/api/v1/openai/models",
        { method: "GET", signal }
    );
    const data = await response.json();
    for (const model of data.data) {
        names.push(model.id);
    }
    return names;
}


async function fetchOpenRouterModels(signal: AbortSignal): Promise<LLMID[]> {
    const names: LLMID[] = [];
    const response = await fetch(
        "http://localhost:3001/api/v1/openrouter/models",
        { method: "GET", signal }
    );
    const data = await response.json();
    for (const model of data.data) {
        if (model.architecture.output_modalities.includes("text")) {
            names.push(model.id);
        }
    }
    return names;
}


export async function getOpenAIExpense(): Promise<number> {
    const now = new Date();
    const firstDayOfTheMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTime = Math.floor(firstDayOfTheMonth.getTime() / 1000);
    const response = await fetch(
        `http://localhost:3001/api/v1/openai/organization/costs?start_time=${String(startTime)}&limit=${100}`,
        { method: "GET", }
    );
    const data = await response.json();
    let totalSpent = 0;
    for (const bucket of data.data) {
        for (const item of bucket.results) {
            totalSpent += item.amount.value;
        }
    }
    return totalSpent;
}


export async function getOpenRouterExpense(): Promise<{ usage: number, total: number }> {
    const response = await fetch("http://localhost:3001/api/v1/openrouter/credits", {
        method: "GET",
    });
    const data = await response.json();
    return {
        usage: data.data.total_usage,
        total: data.data.total_credits
    };
}
