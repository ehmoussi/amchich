import { addAssistantMessageAndClean, createMessage, deleteStreamingMessage, getActiveLLMModel, getConversationMessages, incrementUsageCount, type MessageID, updateFilesContentOfMessages, updateStreamingMessage, type ConversationID, updateConversationTitle, type Role, type LLMModel } from "./db";
import { readFilesAsXML } from "./files";
import { generateTitle } from "./titlegenerator";


const _BUFFER_STREAMING_SIZE = 30;

let controller: AbortController | undefined;

export type WorkerStreamingMessage =
    | { type: "init", payload: { conversationId: ConversationID, maxTokens: number, apiKey: string } }
    | { type: "finished", error: boolean }
    | { type: "abort" };


self.onmessage = async function (event: MessageEvent<WorkerStreamingMessage>) {
    switch (event.data.type) {
        case "init": {
            controller = new AbortController();
            const { conversationId, maxTokens, apiKey } = event.data.payload;
            await streamAnswer(conversationId, maxTokens, apiKey, controller.signal);
            break;
        }
        case "abort":
            if (controller && !controller.signal.aborted)
                controller.abort();
            break;
        default: break;
    }
}

async function streamAnswer(conversationId: ConversationID, maxTokens: number, apiKey: string, signal: AbortSignal): Promise<void> {
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
    let hasError = false;
    try {
        if (model.provider === "Ollama") {
            let bufferThinking = "";
            let bufferText = "";
            for await (const chunk of fetchStreamingOllamaAnswer(messages, model, signal)) {
                if (chunk.thinking) bufferThinking += chunk.thinking;
                bufferText += chunk.text;
                if (chunk.done || bufferThinking.length > _BUFFER_STREAMING_SIZE) {
                    message.content.thinking ??= "";
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
            for await (const chunk of fetchStreamingOpenRouterAnswer(messages, model, maxTokens, apiKey, signal)) {
                if (chunk.thinking) bufferThinking += chunk.thinking;
                bufferText += chunk.text;
                if (chunk.done || bufferThinking.length > _BUFFER_STREAMING_SIZE) {
                    message.content.thinking ??= "";
                    message.content.thinking += bufferThinking;
                    bufferThinking = "";
                    await updateStreamingMessage(message);
                }
                if (chunk.done || bufferText.length > _BUFFER_STREAMING_SIZE) {
                    message.content.text += bufferText;
                    bufferText = "";
                    await updateStreamingMessage(message);
                }
                message.isError = chunk.isError;
                if (chunk.openRouterId)
                    message.openRouterInfos = { ...(message.openRouterInfos ?? {}), id: chunk.openRouterId };
                if (chunk.usage) {
                    const reasoning_tokens = chunk.usage.reasoning_tokens || chunk.usage.completion_tokens_details.reasoning_tokens;
                    message.openRouterInfos = {
                        ...(message.openRouterInfos ?? {}),
                        usage: {
                            cost: chunk.usage.cost,
                            prompt_tokens: chunk.usage.prompt_tokens,
                            completion_tokens: chunk.usage.completion_tokens,
                            reasoning_tokens: reasoning_tokens,
                            total_tokens: chunk.usage.total_tokens,
                        },
                    }
                }
                hasError = chunk.error;
            }
            await incrementUsageCount(model.name);
        }
        else {
            console.error(`Unknown provider: ${model.provider}`);
        }
    } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
            console.error("Abort streaming of the conversation", conversationId);
        else
            throw error;
    } finally {
        if (message.content.text !== "" || message.content.thinking) {
            // 5. Save in the db the answer and clean the streaming message
            await addAssistantMessageAndClean(message);
            await updateFilesContentOfMessages(filesContentByMessage);
            // 6. Update title of the conversation
            if (messages.length === 1) {
                const title = await generateTitle(conversationMessages, model, apiKey);
                if (title)
                    await updateConversationTitle(conversationId, title);
            }
        } else {
            // 5. Clean the streaming message
            await deleteStreamingMessage(conversationId);
        }
        self.postMessage({ type: "finished", error: hasError });
    }
}


interface OllamaMessage {
    role: Role;
    content: string;
    thinking?: string;
}

interface OllamaResponse {
    done: boolean;
    message: {
        content: string;
        thinking?: string;
    };
}

async function* fetchStreamingOllamaAnswer(messages: OllamaMessage[], model: LLMModel, signal: AbortSignal): AsyncGenerator<{ text: string, thinking?: string, done: boolean }> {
    const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
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
            const chunk: OllamaResponse = JSON.parse(buffer) as OllamaResponse;
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


interface OpenRouterUsage {
    completion_tokens: number;
    completion_tokens_details: {
        reasoning_tokens: number;
    };
    reasoning_tokens: number;
    cost: number;
    cost_details: {
        upstream_inference_cost: number | null;
    };
    is_byok: boolean;
    prompt_tokens: number;
    prompt_tokens_details: {
        cached_tokens: number;
    };
    total_tokens: number;
}

interface OpenRouterResponse {
    id: string | null;
    choices: {
        delta: {
            content: string;
            reasoning?: string;
        }
    }[];
    usage?: OpenRouterUsage
}

interface OpenRouterAnswer {
    text: string;
    thinking?: string;
    done: boolean;
    isError: boolean;
    openRouterId?: string;
    usage?: OpenRouterUsage
}

async function* fetchStreamingOpenRouterAnswer(
    messages: OpenRouterMessage[],
    model: LLMModel,
    maxTokens: number,
    apiKey: string,
    signal: AbortSignal
): AsyncGenerator<OpenRouterAnswer> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
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
    if (response.status !== 200) {
        const data = await response.json();
        yield { text: data.error ? data.error.message : "", done: true, isError: true };
        return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Can't read the body of the answer");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            yield { text: "", done: true, isError: false };
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
                if (data === "[DONE]") yield { text: "", done: true, isError: false };
                else {
                    try {
                        const chunk = JSON.parse(data) as OpenRouterResponse;
                        let message: OpenRouterAnswer = {
                            text: chunk.choices[0].delta.content,
                            thinking: chunk.choices[0].delta.reasoning,
                            done: false,
                            isError: false,
                        };
                        if (chunk.id)
                            message.openRouterId = chunk.id;
                        if (chunk.usage) {
                            message.usage = chunk.usage;
                        }
                        yield message;
                    } catch (error: unknown) {
                        console.error(error);
                    }
                }
            }
            // Process next line
            buffer = buffer.slice(lineEndIndex + 1);
        }
    }
}
