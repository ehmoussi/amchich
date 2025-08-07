import type { UUID } from "crypto";
import { add, Dexie, type Table } from "dexie";

export type ConversationID = UUID;
export type MessageID = UUID;
export type Role = "system" | "tool" | "user" | "assistant";


export interface ConversationMeta {
    id: ConversationID;
    title: string;
}

export interface Conversation {
    id: ConversationID;
    title: string;
    createdAt: Date;
    firstMessageIds: MessageID[];
    lastMessageId: MessageID | undefined;
}


interface MessageFiles {
    metadata: File[]; // metadata of the files
    content?: string; // Concatenation of the files to append to the LLM
}

interface MessageContent {
    text: string;
    files: MessageFiles;
    thinking?: string;
}


interface BaseMessage {
    id: MessageID;
    conversationId: ConversationID;
    role: Role;
    createdAt: Date;
    content: MessageContent;
    previousMessageId?: MessageID;
    nextMessageIds?: MessageID[];
}


export interface AssistantMessage extends BaseMessage {
    role: "assistant";
    modelId: LLMID | undefined;
    isActive: boolean;
    openRouterInfos: {
        id: string | null;
        usage?: {
            cost: number;
            prompt_tokens: number;
            reasoning_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        }
    }
}

export interface UserMessage extends BaseMessage {
    role: "user";
    modelId: undefined;
    isActive: boolean;
}

export type Message = AssistantMessage | UserMessage;



export type LLMID = string;
export type LLMProvider = "Ollama" | "OpenAI" | "OpenRouter";

export interface LLMModel {
    name: LLMID;
    isActive: boolean;
    createdAt: Date;
    provider: LLMProvider;
    usageCount: number;
}




interface AmchichDB extends Dexie {
    conversations: Table<Conversation, ConversationID>;
    messages: Table<Message, MessageID>;
    streamingMessages: Table<AssistantMessage, MessageID>;
    models: Table<LLMModel, LLMID>;
}

const amchichDB = new Dexie("amchichDB") as AmchichDB;


amchichDB.version(1).stores({
    conversations: "id, createdAt, *firstMessageIds, lastMessageId",
    messages: "id, conversationId, role, createdAt, isActive, previousMessageId, *nextMessageIds",
    streamingMessages: "id, conversationId",
    models: "name, isActive, createdAt, provider, usageCount",
});

export function isUserMessage(message: Message): message is UserMessage {
    return message.role === "user";
}

export function isAssistantMessage(message: Message): message is AssistantMessage {
    return message.role === "assistant";
}

export async function getConversationsMetadata(): Promise<ConversationMeta[]> {
    try {
        const conversations = await amchichDB.conversations.orderBy("createdAt").reverse().toArray();
        return conversations.map((conversation) => {
            return {
                id: conversation.id,
                title: conversation.title,
            };
        });
    } catch (error) {
        console.error("Failed to retrieve the conversations metadata:", error)
        return [];
    }
}

export async function createConversation(isActive: boolean): Promise<ConversationID> {
    const id = crypto.randomUUID();
    const title = "New Conversation";
    const createdAt = new Date();
    const firstMessageIds: MessageID[] = [];
    const lastMessageId = undefined;
    const conversation = { id, title, createdAt, isActive, firstMessageIds, lastMessageId };
    await amchichDB.conversations.add(conversation);
    return conversation.id;
}


export async function updateConversationTitle(conversationId: ConversationID, title: string): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.conversations, async () => {
        await amchichDB.conversations.update(conversationId, { title: title });
    });
}


export async function deleteConversation(conversationId: ConversationID) {
    await amchichDB.transaction("rw", amchichDB.conversations, amchichDB.messages, async () => {
        await amchichDB.messages.where("conversationId").equals(conversationId).delete();
        await amchichDB.conversations.delete(conversationId);
    });
}

export async function isConversationStreaming(conversationId: ConversationID): Promise<boolean> {
    return await amchichDB.streamingMessages.where({ conversationId }).first() !== undefined;
}


export async function addUserMessage(message: Message): Promise<void> {
    await amchichDB.transaction(
        "rw", amchichDB.conversations, amchichDB.messages,
        async () => { await addMessage(message); }
    );
}

export async function addAssistantMessageAndClean(message: Message): Promise<void> {
    await amchichDB.transaction(
        "rw", amchichDB.conversations, amchichDB.messages, amchichDB.streamingMessages,
        async () => {
            await addMessage(message);
            await amchichDB.streamingMessages.where({ conversationId: message.conversationId }).delete();
        }
    );
}

async function addMessage(message: Message): Promise<void> {
    const conversation = await amchichDB.conversations.get(message.conversationId);
    if (!conversation)
        throw new Error("Can't find the conversation associated to the given message");
    message.previousMessageId = conversation.lastMessageId;
    if (!conversation.lastMessageId) {
        await amchichDB.conversations.update(
            conversation.id,
            {
                firstMessageIds: [...conversation.firstMessageIds, message.id],
                lastMessageId: message.id
            }
        );
    } else {
        const previousMessage = await amchichDB.messages.get(conversation.lastMessageId);
        if (previousMessage) {
            await amchichDB.messages.update(
                conversation.lastMessageId,
                { nextMessageIds: [...(previousMessage.nextMessageIds ?? []), message.id] }
            );
        }
        await amchichDB.conversations.update(conversation.id, { lastMessageId: message.id });
    }
    await amchichDB.messages.add(message);
}

export async function editUserMessage(message: UserMessage, newMessage: UserMessage): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.messages, amchichDB.conversations, async () => {
        newMessage.previousMessageId = message.previousMessageId;
        await amchichDB.messages.update(message.id, { isActive: false });
        if (message.previousMessageId) {
            await amchichDB.messages.update(message.previousMessageId, { nextMessageIds: add([newMessage.id]) });
            await amchichDB.conversations.update(newMessage.conversationId, { lastMessageId: newMessage.id });
        } else {
            await amchichDB.conversations.update(newMessage.conversationId, { lastMessageId: newMessage.id, firstMessageIds: add([newMessage.id]) });
        }
        await amchichDB.messages.add(newMessage);
    });
}

export async function getSiblings(message: UserMessage): Promise<MessageID[]> {
    let siblings: MessageID[] = [];
    await amchichDB.transaction("r", amchichDB.messages, amchichDB.conversations, async () => {
        if (message.previousMessageId) {
            const previousMessage = await amchichDB.messages.get(message.previousMessageId);
            if (previousMessage) {
                if (previousMessage.nextMessageIds) siblings = previousMessage.nextMessageIds;
            } else {
                throw new Error(`Can't find the previous message "${message.previousMessageId}"`);
            }
        } else {
            const conversation = await amchichDB.conversations.get(message.conversationId);
            if (conversation) {
                siblings = conversation.firstMessageIds;
            } else {
                throw new Error(`Can't find the conversation "${message.conversationId}"`);
            }
        }
    });
    return siblings;
}

export async function updateActiveMessage(oldActiveMessageId: MessageID, newActiveMessageId: MessageID): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.messages, amchichDB.conversations, async () => {
        await amchichDB.messages.update(oldActiveMessageId, { isActive: false });
        await amchichDB.messages.update(newActiveMessageId, { isActive: true });
        const newActiveMessage = await amchichDB.messages.get(newActiveMessageId);
        let lastMessage = newActiveMessage;
        while (lastMessage !== undefined) {
            if (lastMessage.nextMessageIds) {
                const nextMessages = await amchichDB.messages.bulkGet(lastMessage.nextMessageIds);
                const message = nextMessages.find((m) => m?.isActive);
                if (message) lastMessage = message;
                else break;
            } else {
                break;
            }
        }
        if (lastMessage) {
            await amchichDB.conversations.update(lastMessage.conversationId, { lastMessageId: lastMessage.id });
        }
    });
}

export async function updateFilesContentOfMessages(filesContentByMessage: Map<MessageID, string>): Promise<void> {
    await amchichDB.messages.bulkUpdate(
        Array.from(filesContentByMessage.entries()).map(([messageId, filesContent]) => {
            return {
                key: messageId,
                changes: { "content.files.content": filesContent }
            };
        })
    );
}

export async function getConversationMessages(conversationId: ConversationID): Promise<Message[]> {
    const messages: Message[] = [];
    await amchichDB.transaction("r", amchichDB.messages, amchichDB.conversations, async () => {
        const conversation = await amchichDB.conversations.get(conversationId);
        if (conversation) {
            const firstMessages = await amchichDB.messages.bulkGet(conversation.firstMessageIds);
            let message = firstMessages.find((m) => m?.isActive);
            while (message !== undefined) {
                messages.push(message);
                if (message.nextMessageIds) {
                    const nextMessages = await amchichDB.messages.bulkGet(message.nextMessageIds);
                    message = nextMessages.find((m) => m?.isActive);
                } else {
                    message = undefined;
                }
            }
        }
    });
    return messages;
}


export async function getStreamingMessage(conversationId: ConversationID): Promise<AssistantMessage | undefined> {
    return await amchichDB.streamingMessages.get({ conversationId });
}


export async function updateStreamingMessage(message: AssistantMessage): Promise<void> {
    await amchichDB.streamingMessages.put(message);
}

export async function deleteStreamingMessage(conversationId: ConversationID): Promise<void> {
    await amchichDB.streamingMessages.where({ conversationId }).delete();
}


export function createMessage(
    conversationId: ConversationID,
    role: "assistant",
    text: string,
    files: File[],
    isActive: true,
    modelId?: LLMID,
): AssistantMessage;
export function createMessage(
    conversationId: ConversationID,
    role: "user",
    text: string,
    files: File[],
    isActive: boolean,
): UserMessage;
export function createMessage(conversationId: ConversationID, role: Role, text: string, files: File[], isActive: boolean, modelId?: LLMID): Message {
    if (role === "assistant" && !isActive)
        throw new Error("Can't create an assistant message which is not active.");
    return {
        id: crypto.randomUUID(),
        conversationId,
        role,
        modelId,
        isActive,
        createdAt: new Date(),
        content: {
            text,
            files: {
                metadata: files,
            },
        },
    } as Message;
}


export function createModel(name: LLMID, provider: LLMProvider, date: Date | undefined = undefined): LLMModel {
    const createdAt = date ?? new Date();
    const usageCount = 0;
    const isActive = false;
    return {
        name,
        isActive,
        provider,
        createdAt,
        usageCount
    }
}

export async function addModel(name: LLMID, provider: LLMProvider): Promise<void> {
    const createdAt = new Date();
    await amchichDB.models.add({ name, isActive: false, createdAt, provider, usageCount: 0 });
}


export async function setModels(models: LLMModel[]) {
    await amchichDB.transaction("rw", amchichDB.models, async () => {
        const oldModels = await amchichDB.models.toArray();

        const toDeleteNames: LLMID[] = [];
        const newModels: LLMModel[] = [];
        for (const { name: oldName } of oldModels) {
            let toDelete = true;
            for (const { name } of models) {
                if (name === oldName) {
                    toDelete = false;
                    break;
                }
            }
            if (toDelete) toDeleteNames.push(oldName);
        }
        const createdAt = new Date();
        for (const { name, provider } of models) {
            let canAdd = true;
            for (const { name: oldName } of oldModels) {
                if (name === oldName) {
                    canAdd = false;
                    break;
                }
            }
            if (canAdd)
                newModels.push(createModel(name, provider, createdAt));
        }
        if (toDeleteNames.length > 0)
            await amchichDB.models.bulkDelete(toDeleteNames);
        if (newModels.length > 0)
            await amchichDB.models.bulkAdd(newModels);
    });
}

export async function clearLLMModels(): Promise<void> {
    await amchichDB.models.clear();
}

export async function getLLMModels(): Promise<LLMModel[]> {
    return await amchichDB.models.orderBy("name").toArray();
}


export async function getLLMModelsByProvider(ignoreModels: LLMModel[]): Promise<Map<LLMProvider, LLMModel[]>> {
    const modelsByProvider = new Map<LLMProvider, LLMModel[]>();
    const models = await amchichDB.models.orderBy("name").toArray();
    for (const model of models) {
        if (ignoreModels.some((m) => model.name === m.name)) continue;
        if (modelsByProvider.has(model.provider))
            modelsByProvider.get(model.provider)?.push(model);
        else
            modelsByProvider.set(model.provider, [model]);
    }
    return modelsByProvider;
}

export async function getMostUsedLLMModels(maxModels: number): Promise<LLMModel[]> {
    return await amchichDB.models
        .orderBy("usageCount")
        .filter((m) => m.usageCount > 0)
        .limit(maxModels)
        .toArray();
}

export async function getLLMIds(): Promise<LLMID[]> {
    const models = await getLLMModels();
    return models.map((m) => m.name);
}

export async function getActiveLLMModel(): Promise<LLMModel | undefined> {
    return await amchichDB.models.filter((model) => model.isActive).first();
}

export async function setActiveLLMModel(name: LLMID) {
    await amchichDB.transaction("rw", amchichDB.models, async () => {
        const currentActiveModel = await amchichDB.models.filter((model) => model.isActive).first();
        if (!currentActiveModel || currentActiveModel.name != name) {
            if (currentActiveModel)
                await amchichDB.models.update(currentActiveModel, { isActive: false });
            await amchichDB.models.update(name, { isActive: true });
        }
    });
}


export async function areModelsObsolete(): Promise<boolean> {
    const lastUpdate = (await amchichDB.models.orderBy("createdAt").last())?.createdAt;
    if (lastUpdate) {
        const today = new Date();
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.floor((today.getTime() - lastUpdate.getTime()) / oneDay) > 1;
    }
    return true;
}


export async function incrementUsageCount(modelId: LLMID): Promise<void> {
    await amchichDB.models.update(modelId, { usageCount: add(1) });
}