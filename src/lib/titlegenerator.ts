import type { LLMModel, Message } from "./db";

export async function generateTitle(messages: Message[], model: LLMModel, apiKey: string): Promise<string | undefined> {
    const prompt = buildTitlePrompt(messages);
    if (model.provider === "OpenAI" || model.provider === "OpenRouter") {
        return await generateWithOpenRouter(prompt, apiKey);
    } else {
        return await generateWithOllama(prompt);
    }
}

async function generateWithOpenRouter(prompt: string, apiKey: string): Promise<string | undefined> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: prompt }],
            stream: false,
            reasoning: { exclude: true },
            max_tokens: 16,
            temperature: 0.2,
            user: "amchich",
        }),
    });
    const data = await response.json();
    return data.choices[0].message.content;
}


async function generateWithOllama(prompt: string): Promise<string | undefined> {
    const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3.1:latest",
            messages: [{ role: "user", content: prompt }],
            stream: false,
            think: false,
        }),
    });
    const data = await response.json();
    return data.message.content.trim();
}


function buildTitlePrompt(messages: Message[]) {
    const excerpt = messages
        .slice(-10)               // last 10 messages is usually enough
        .map(m => `${m.role}: ${m.content.text}`)
        .join("\n");
    return `
You are a smart assistant. Based on the following chat excerpt, generate a 3-6 word, 
intuitive title that captures the topic of the conversation.  
Keep it concise, no punctuation at the end. 

GIVE ONLY THE TITLE.

${excerpt}
—
Title:
`.trim();
}
