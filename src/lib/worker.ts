import { addAssistantMessageAndClean, createMessage, deleteStreamingMessage, getActiveLLMModel, getConversationMessages, incrementUsageCount, type MessageID, updateFilesContentOfMessages, updateStreamingMessage, type ConversationID, updateConversationTitle, type Role, type LLMModel } from "./db";
import { readFilesAsXML } from "./files";
import { generateTitle } from "./titlegenerator";


const _BUFFER_STREAMING_SIZE = 30;

let controller: AbortController | undefined;

export type WorkerStreamingMessage =
    | { type: "init", payload: { conversationId: ConversationID, maxTokens: number } }
    | { type: "finished" }
    | { type: "abort" };


self.onmessage = async function (event: MessageEvent<WorkerStreamingMessage>) {
    switch (event.data.type) {
        case "init": {
            controller = new AbortController();
            const { conversationId, maxTokens } = event.data.payload;
            await streamAnswer(conversationId, maxTokens, controller.signal);
            break;
        }
        case "abort":
            if (controller && !controller.signal.aborted)
                controller.abort();
            break;
        default: break;
    }
}

async function streamAnswer(conversationId: ConversationID, maxTokens: number, signal: AbortSignal): Promise<void> {
    // 1. Retrieve the current LLM model
    const model = await getActiveLLMModel();
    if (!model) throw new Error(`Can't find an active LLM model`);
    // 2. Create an empty message
    const message = createMessage(conversationId, "assistant", "", [], true, model.name);
    await updateStreamingMessage(message);
    // 3. Retrieve the current messsages of the conversation 
    const conversationMessages = await getConversationMessages(conversationId);
    const messages = [];
    const filesContentByMessage = new Map<MessageID, string>();
    for (const conversationMessage of conversationMessages) {
        let content = conversationMessage.content.text;
        if (conversationMessage.role === "user" && conversationMessage.content.files.metadata.length > 0) {
            content += "\n\n";
            const filesContent = await readFilesAsXML(conversationMessage.content.files.metadata);
            content += filesContent;
            filesContentByMessage.set(conversationMessage.id, filesContent);
        }
        messages.push({
            role: conversationMessage.role,
            content: content,
        });
    }
    // 4. Start the streaming of the assistant answer
    try {
        if (model.provider === "Ollama") {
            let bufferThinking = "";
            let bufferText = "";
            for await (const chunk of fetchStreamingOllamaAnswer(messages, model, signal)) {
                if (chunk.thinking) bufferThinking += chunk.thinking;
                bufferText += chunk.text;
                if (chunk.done || bufferThinking.length > _BUFFER_STREAMING_SIZE) {
                    if (message.content.thinking === undefined) message.content.thinking = "";
                    message.content.thinking += bufferThinking;
                    bufferThinking = "";
                    await updateStreamingMessage(message);
                }
                if (chunk.done || bufferText.length > _BUFFER_STREAMING_SIZE) {
                    message.content.text += bufferText;
                    bufferText = "";
                    await updateStreamingMessage(message);
                }
            }
            await incrementUsageCount(model.name);
        }
        else if (model.provider === "OpenRouter") {
            let bufferThinking = "";
            let bufferText = "";
            for await (const chunk of fetchStreamingOpenRouterAnswer(messages, model, maxTokens, signal)) {
                if (chunk.thinking) bufferThinking += chunk.thinking;
                bufferText += chunk.text;
                if (chunk.done || bufferThinking.length > _BUFFER_STREAMING_SIZE) {
                    if (message.content.thinking === undefined) message.content.thinking = "";
                    message.content.thinking += bufferThinking;
                    bufferThinking = "";
                    await updateStreamingMessage(message);
                }
                if (chunk.done || bufferText.length > _BUFFER_STREAMING_SIZE) {
                    message.content.text += bufferText;
                    bufferText = "";
                    await updateStreamingMessage(message);
                }
            }
            await incrementUsageCount(model.name);
        }
        else if (model.provider === "OpenAI") {
            let buffer = "";
            for await (const chunk of fetchStreamingOpenAIAnswer(messages, model, maxTokens, signal)) {
                buffer += chunk.text;
                if (chunk.done || buffer.length > _BUFFER_STREAMING_SIZE) {
                    message.content.text += buffer;
                    buffer = "";
                    await updateStreamingMessage(message);
                }
            }
            await incrementUsageCount(model.name);
        } else {
            console.error(`Unknown provider: ${model.provider}`);
        }
    } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
            console.error("Abort streaming of the conversation", conversationId);
        else
            throw error;
    } finally {
        if (message.content.text !== "") {
            // 5. Save in the db the answer and clean the streaming message
            await addAssistantMessageAndClean(message);
            await updateFilesContentOfMessages(filesContentByMessage);
            // 6. Update title of the conversation
            if (messages.length === 1) {
                const title = await generateTitle(conversationMessages, model);
                if (title)
                    await updateConversationTitle(conversationId, title);
            }
        } else {
            // 5. Clean the streaming message
            await deleteStreamingMessage(conversationId);
        }
        self.postMessage({ type: "finished" });
    }
}


interface OllamaMessage {
    role: Role;
    content: string;
    thinking?: string;
}

async function* fetchStreamingOllamaAnswer(messages: OllamaMessage[], model: LLMModel, signal: AbortSignal): AsyncGenerator<{ text: string, thinking?: string, done: boolean }> {
    const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: model.name,
            messages: messages,
            stream: true,
            think: true,
        }),
        signal,
    });
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Can't read the body of the answer");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = decoder.decode(value, { stream: true });
        try {
            const chunk = JSON.parse(buffer);
            yield { text: chunk.message.content, thinking: chunk.message.thinking, done: chunk.done };
            if (chunk.done) break;
        } catch { // Ignore the errors
        }
    }
}

interface OpenRouterMessage {
    role: Role;
    content: string;
}

async function* fetchStreamingOpenRouterAnswer(messages: OpenRouterMessage[], model: LLMModel, maxTokens: number, signal: AbortSignal): AsyncGenerator<{ text: string, thinking?: string, done: boolean }> {
    const response = await fetch("http://localhost:3001/api/v1/openrouter/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: model.name,
            messages: messages,
            stream: true,
            reasoning: {
                exclude: false,
            },
            usage: {
                include: true,// TODO: Store it
            },
            max_tokens: maxTokens,
            user: "amchich",
        }),
        signal,
    });
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Can't read the body of the answer");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            yield { text: "", done: true };
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        // Process each lines
        while (true) {
            const lineEndIndex = buffer.indexOf("\n");
            if (lineEndIndex === -1) break; // No new line
            const line = buffer.slice(0, lineEndIndex).trim();
            // Extract data
            if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") yield { text: "", done: true };
                try {
                    const chunk = JSON.parse(data);
                    yield { text: chunk.choices[0].delta.content, thinking: chunk.choices[0].delta.reasoning, done: false };
                } catch { // Ignore the errors
                }
            }
            // Process next line
            buffer = buffer.slice(lineEndIndex + 1);
        }
    }
}

interface OpenAIMessage {
    role: Role;
    content: string;
}

async function* fetchStreamingOpenAIAnswer(messages: OpenAIMessage[], model: LLMModel, maxTokens: number, signal: AbortSignal): AsyncGenerator<{ text: string, thinking?: string, done: boolean }> {
    // const reasoning = model.name.startsWith("o") ? { summary: "detailed" } : undefined;
    const response = await fetch("http://localhost:3001/api/v1/openai/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: model.name,
            input: messages,
            stream: true,
            // reasoning,
            max_output_tokens: maxTokens,
            user: "amchich",
        }),
        signal,
    });
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Can't read the body of the answer");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            yield { text: "", done: true };
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        console.log("buffer:", buffer);
        // Process each lines
        while (true) {
            let lineEndIndex = buffer.indexOf("\n");
            if (lineEndIndex === -1) break; // No new line
            let line = buffer.slice(0, lineEndIndex).trim();
            // console.log("line:", line);
            // Process next line
            buffer = buffer.slice(lineEndIndex + 1);
            if (line.startsWith("event: ")) {
                const event = line.slice(7);
                if (event === "response.completed")
                    yield { text: "", done: true };
                else if (event === "response.output_text.delta") {
                    lineEndIndex = buffer.indexOf("\n");
                    if (lineEndIndex === -1) break;
                    line = buffer.slice(0, lineEndIndex).trim();
                    // Extract data
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        console.log("data:", data);
                        try {
                            const chunk = JSON.parse(data);
                            yield { text: chunk.delta, done: false }
                        } catch { // Ignore the errors
                        }
                    }
                }
            }
        }
    }
}
