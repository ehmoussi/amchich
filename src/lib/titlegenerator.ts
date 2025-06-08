import OpenAI from "openai";
import type { LLMModel, Message } from "./db";

export async function generateTitle(messages: Message[], model: LLMModel): Promise<string | undefined> {
    const prompt = buildTitlePrompt(messages);
    if (model.provider === "OpenAI") {
        return await generateWithOpenAI(prompt);
    } else {
        return await generateWithOllama(prompt);
    }
}

async function generateWithOpenAI(prompt: string): Promise<string | undefined> {
    const client = new OpenAI({
        baseURL: "http://localhost:3001/api/v1/openai",
        apiKey: "dummy",
        dangerouslyAllowBrowser: true,
    });
    const result = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        max_tokens: 12,
        temperature: 0.2
    });
    return result.choices[0].message.content.trim();
}

async function generateWithOllama(prompt: string): Promise<string | undefined> {
    const client = new OpenAI({
        baseURL: "http://localhost:11434/v1/",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
    });
    console.log("prompt:", prompt);
    const response = await client.chat.completions.create({
        model: "llama3.1:latest",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 12,
        temperature: 0.2
    });
    return response.choices[0].message.content.trim();
}


function buildTitlePrompt(messages: Message[]) {
    const excerpt = messages
        .slice(-10)               // last 10 messages is usually enough
        .map(m => `${m.role}: ${m.content.text}`)
        .join("\n");
    return `
You are a smart assistant. Based on the following chat excerpt, generate a 3-6 word, 
intuitive title that captures the topic of the conversation.  
Keep it concise—no punctuation at the end.

${excerpt}
—
Title:
`.trim();
}
