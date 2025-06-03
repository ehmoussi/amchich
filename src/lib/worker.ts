import OpenAI from "openai";
import { addAssistantMessageAndClean, createMessage, deleteStreamingMessage, getActiveLLMModel, getConversationMessages, incrementUsageCount, updateStreamingMessage, type ConversationID } from "./db";

const _BUFFER_STREAMING_SIZE = 30;

let controller: AbortController | undefined;

export type WorkerStreamingMessage =
    | { type: "init", payload: { conversationId: ConversationID } }
    | { type: "finished" }
    | { type: "abort" };


self.onmessage = async function (event: MessageEvent<WorkerStreamingMessage>) {
    switch (event.data.type) {
        case "init": {
            controller = new AbortController();
            const { conversationId } = event.data.payload;
            await streamAnswer(conversationId, controller.signal);
            break;
        }
        case "abort":
            if (controller && !controller.signal.aborted)
                controller.abort();
            break;
        default: break;
    }
}

async function streamAnswer(conversationId: ConversationID, signal: AbortSignal): Promise<void> {
    // 1. Retrieve the current LLM model
    const model = await getActiveLLMModel();
    if (!model) throw new Error(`Can't find an active LLM model`);
    // 2. Create an empty message
    const message = createMessage(conversationId, "assistant", "", [], true, model.name);
    await updateStreamingMessage(message);
    // 3. Retrieve the current messsages of the conversation 
    const conversationMessages = await getConversationMessages(conversationId);
    const messages = [];
    for (const conversationMessage of conversationMessages) {
        messages.push({
            role: conversationMessage.role,
            content: conversationMessage.content.text
        });
    }
    // 4. Define the appropriate client for the LLM provider
    let client: OpenAI;
    if (model.provider === "Ollama")
        client = new OpenAI({
            baseURL: "http://localhost:11434/v1/",
            apiKey: "ollama",
            dangerouslyAllowBrowser: true,
        });
    else
        client = new OpenAI({
            apiKey: import.meta.env.VITE_OPENAI_API_KEY as string,
            dangerouslyAllowBrowser: true,
        });
    try {
        // 5. Start the streaming of the assistant answer
        const response = await client.chat.completions.create({
            model: model.name,
            messages: messages,
            stream: true,
        }, { signal: signal });
        // 6. Increment the usage of the model
        await incrementUsageCount(model.name);
        // 7. Streaming chunk by chunk the answer
        let buffer = "";
        for await (const chunk of response) {
            if (chunk.choices[0].delta.content)
                buffer += chunk.choices[0].delta.content;
            if (buffer.length > _BUFFER_STREAMING_SIZE) {
                message.content.text += buffer;
                await updateStreamingMessage(message);
                buffer = "";
            }
        }
        if (buffer.length > 0) {
            message.content.text += buffer;
            await updateStreamingMessage(message);
        }
    } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
            console.error("Abort streaming of the conversation", conversationId);
        else
            throw error;
    } finally {
        if (message.content.text !== "") {
            // TODO: 8. Update title of the conversation
            // 9. Save in the db the answer and clean the streaming message
            await addAssistantMessageAndClean(message);
        } else {
            // 8. Clean the streaming message
            await deleteStreamingMessage(conversationId);
        }
        self.postMessage({ type: "finished" });
    }
}
