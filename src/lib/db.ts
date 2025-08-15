import type { UUID } from "crypto";
import { add, Dexie, type Table } from "dexie";
import { getToken } from "./tokenutils";

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
    isError: boolean;
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
export type LLMProvider = "Ollama" | "OpenRouter";

export interface LLMModel {
    name: LLMID;
    isActive: boolean;
    createdAt: Date;
    provider: LLMProvider;
    usageCount: number;
}


export type LastEventID = UUID;
type DeviceID = UUID;
type OutboxID = UUID;
type OperationType = "insert" | "update" | "delete";
type TableType = "conversation" | "message" | "streaming" | "models";

interface Device {
    deviceId: DeviceID;
    lastEventId: LastEventID | undefined;
}

export interface Outbox {
    id: OutboxID;
    deviceId: DeviceID;
    createdAt: Date;
    op: OperationType;
    table: TableType;
    payload: any;
}

interface AmchichDB extends Dexie {
    conversations: Table<Conversation, ConversationID>;
    messages: Table<Message, MessageID>;
    streamingMessages: Table<AssistantMessage, MessageID>;
    models: Table<LLMModel, LLMID>;
    outbox: Table<Outbox, OutboxID>;
    device: Table<Device, DeviceID>;
}

const amchichDB = new Dexie("amchichDB") as AmchichDB;


amchichDB.version(1).stores({
    conversations: "id, createdAt, *firstMessageIds, lastMessageId",
    messages: "id, conversationId, role, createdAt, isActive, previousMessageId, *nextMessageIds",
    streamingMessages: "id, conversationId",
    models: "name, isActive, createdAt, provider, usageCount",
});


amchichDB.version(2).stores({
    conversations: "id, createdAt, *firstMessageIds, lastMessageId",
    messages: "id, conversationId, role, createdAt, isActive, previousMessageId, *nextMessageIds",
    streamingMessages: "id, conversationId",
    models: "name, isActive, createdAt, provider, usageCount",
    outbox: "id, createdAt",
    device: "deviceId",
});

amchichDB.use({
    stack: "dbcore",
    name: "NotifyBackendsOfEvents",
    create(down) {
        return {
            ...down,
            table(tableName) {
                const t = down.table(tableName);
                if (tableName !== "outbox") return t;
                return {
                    ...t,
                    async mutate(req) {
                        if (req.type !== "add")
                            return t.mutate(req);
                        const res = await t.mutate(req);
                        if (res.numFailures === 0)
                            updateBackendEvents();
                        return res;
                    }
                };
            }
        };
    }
});

async function getOrCreateDeviceId(): Promise<DeviceID> {
    const id = (await amchichDB.device.toCollection().first())?.deviceId;
    if (!id) {
        const deviceId: DeviceID = crypto.randomUUID();
        await amchichDB.transaction("rw", amchichDB.device, async () => {
            await amchichDB.device.add({ deviceId, lastEventId: undefined });
        });
        return deviceId;
    }
    return id;
}

export async function updateLastEventId(lastEventId: UUID): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.device, async () => {
        const deviceId = await getOrCreateDeviceId();
        await amchichDB.device.update(deviceId, { lastEventId: lastEventId });
    });
}

const currentDeviceId = await getOrCreateDeviceId();

function newOutbox(op: OperationType, table: TableType, payload: any): Outbox {
    return {
        id: crypto.randomUUID(),
        deviceId: currentDeviceId,
        createdAt: new Date(),
        op,
        table,
        payload
    }
}

export async function getOutboxEvents(): Promise<Outbox[]> {
    return await amchichDB.outbox.orderBy("createdAt").toArray();
}


export async function updateBackendEvents(): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.outbox, amchichDB.device, async () => {
        const events = await getOutboxEvents();
        console.log(events);
        const token = await getToken();
        if (!token) {
            throw new Error("Failed to retrieve a token");
        }
        console.log("token ok");
        const body = JSON.stringify(events);
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/events`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body,
            },
        );
        const content = await response.json();
        console.log(content);
        if (!response.ok) {
            throw new Error(`Synchronization failed with status ${response.status}:\n${content}`);
        } else if (content.lastEventId !== undefined) {
            console.log(content.lastEventId);
            await updateLastEventId(content.lastEventId);
            console.log("updateLastEventId");
            const eventIds = events.map((e) => e.id);
            await clearOutboxEvents(eventIds);
            console.log("clearOutboxEvents");
        }
    });
}

export async function clearOutboxEvents(eventIds: OutboxID[]): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.outbox, async () => {
        await amchichDB.outbox.bulkDelete(eventIds);
    });
}


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
    await amchichDB.transaction("rw", amchichDB.conversations, amchichDB.outbox, async () => {
        await amchichDB.conversations.add(conversation);
        const payload = { id, title, createdAt };
        const outbox = newOutbox("insert", "conversation", payload);
        await amchichDB.outbox.add(outbox);
    });
    return conversation.id;
}


export async function updateConversationTitle(conversationId: ConversationID, title: string): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.conversations, amchichDB.outbox, async () => {
        await amchichDB.conversations.update(conversationId, { title: title });
        const outbox = newOutbox("update", "conversation", { id: conversationId, title });
        await amchichDB.outbox.add(outbox);
    });
}


export async function deleteConversation(conversationId: ConversationID) {
    await amchichDB.transaction("rw", amchichDB.conversations, amchichDB.messages, amchichDB.outbox, async () => {
        // Extract messages of the conversion 
        const collectionMessages = amchichDB.messages.where("conversationId").equals(conversationId);
        const messageIds = (await collectionMessages.toArray()).map((m) => m.id);
        // Delete messages
        await collectionMessages.delete();
        // Delete conversation
        await amchichDB.conversations.delete(conversationId);
        // Outbox
        const outbox = newOutbox("delete", "conversation", { id: conversationId });
        await amchichDB.outbox.add(outbox);
        messageIds.forEach(async (messageId) => {
            const outbox = newOutbox("delete", "message", { id: messageId });
            await amchichDB.outbox.add(outbox);
        });
    });
}

export async function isConversationStreaming(conversationId: ConversationID): Promise<boolean> {
    return await amchichDB.streamingMessages.where({ conversationId }).first() !== undefined;
}


export async function addUserMessage(message: Message): Promise<void> {
    await amchichDB.transaction(
        "rw", amchichDB.conversations, amchichDB.messages, amchichDB.outbox,
        async () => {
            await addMessage(message);
        }
    );
}

export async function addAssistantMessageAndClean(message: Message): Promise<void> {
    await amchichDB.transaction(
        "rw", amchichDB.conversations, amchichDB.messages, amchichDB.streamingMessages, amchichDB.outbox,
        async () => {
            await addMessage(message);
            const streamingMessagesCollection = amchichDB.streamingMessages.where({ conversationId: message.conversationId });
            const streamingMessageIds = (await streamingMessagesCollection.toArray()).map((m) => m.id);
            await streamingMessagesCollection.delete();
            // Outbox
            await amchichDB.outbox.add(newOutbox("insert", "message", message));
            await amchichDB.outbox.bulkAdd(streamingMessageIds.map((mId) => newOutbox("delete", "streaming", { id: mId })));
        }
    );
}

async function addMessage(message: Message): Promise<void> {
    const conversation = await amchichDB.conversations.get(message.conversationId);
    if (!conversation)
        throw new Error("Can't find the conversation associated to the given message");
    message.previousMessageId = conversation.lastMessageId;
    if (!conversation.lastMessageId) {
        const changes = {
            firstMessageIds: [...conversation.firstMessageIds, message.id],
            lastMessageId: message.id
        };
        await amchichDB.conversations.update(conversation.id, changes);
        // Outbox
        const payload = { id: message.conversationId, ...changes };
        await amchichDB.outbox.add(newOutbox("update", "conversation", payload));
    } else {
        const previousMessage = await amchichDB.messages.get(conversation.lastMessageId);
        if (previousMessage) {
            const changes = { nextMessageIds: [...(previousMessage.nextMessageIds ?? []), message.id] };
            await amchichDB.messages.update(conversation.lastMessageId, changes);
            // Outbox
            const payload = { id: conversation.lastMessageId, ...changes };
            await amchichDB.outbox.add(newOutbox("update", "message", payload));
        }
        const changes = { lastMessageId: message.id };
        await amchichDB.conversations.update(conversation.id, changes);
        // Outbox
        const payload = { id: conversation.id, ...changes };
        await amchichDB.outbox.add(newOutbox("update", "conversation", payload));
    }
    await amchichDB.messages.add(message);
    // Outbox
    await amchichDB.outbox.add(newOutbox("insert", "message", message));
}

export async function editUserMessage(message: UserMessage, newMessage: UserMessage): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.messages, amchichDB.conversations, amchichDB.outbox, async () => {
        newMessage.previousMessageId = message.previousMessageId;
        await amchichDB.messages.update(message.id, { isActive: false });
        // Outbox
        await amchichDB.outbox.add(newOutbox("update", "message", { id: message.id, isActive: false }));
        if (message.previousMessageId) {
            await amchichDB.messages.update(message.previousMessageId, { nextMessageIds: add([newMessage.id]) });
            await amchichDB.conversations.update(newMessage.conversationId, { lastMessageId: newMessage.id });
            // Outbox
            await amchichDB.outbox.add(newOutbox("update", "message", { id: message.previousMessageId, nextMessageIds: { add: newMessage.id } }));
            await amchichDB.outbox.add(newOutbox("update", "conversation", { id: newMessage.conversationId, lastMessageId: newMessage.id }));
        } else {
            await amchichDB.conversations.update(newMessage.conversationId, { lastMessageId: newMessage.id, firstMessageIds: add([newMessage.id]) });
            // Outbox
            await amchichDB.outbox.add(newOutbox("update", "conversation", { id: newMessage.conversationId, lastMessageId: newMessage.id, firstMessageIds: { add: newMessage.id } }));
        }
        await amchichDB.messages.add(newMessage);
        // Outbox
        await amchichDB.outbox.add(newOutbox("insert", "message", newMessage));
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
    await amchichDB.transaction("rw", amchichDB.messages, amchichDB.conversations, amchichDB.outbox, async () => {
        await amchichDB.messages.update(oldActiveMessageId, { isActive: false });
        // Outbox
        await amchichDB.outbox.add(newOutbox("update", "message", { id: oldActiveMessageId, isActive: false }));
        await amchichDB.messages.update(newActiveMessageId, { isActive: true });
        // Outbox
        await amchichDB.outbox.add(newOutbox("update", "message", { id: newActiveMessageId, isActive: true }));
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
            // Outbox
            await amchichDB.outbox.add(newOutbox("update", "conversation", { id: lastMessage.conversationId, lastMessageId: lastMessage.id }));
        }
    });
}

export async function updateFilesContentOfMessages(filesContentByMessage: Map<MessageID, string>): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.messages, amchichDB.outbox, async () => {
        const keysAndChanges = Array.from(filesContentByMessage.entries()).map(([messageId, filesContent]) => {
            return {
                key: messageId,
                changes: { "content.files.content": filesContent }
            };
        });
        await amchichDB.messages.bulkUpdate(keysAndChanges);
        // Outbox
        await amchichDB.outbox.bulkAdd(keysAndChanges.map(({ key, changes }) => newOutbox("update", "message", { id: key, ...changes })));
    });
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
    await amchichDB.transaction("rw", amchichDB.streamingMessages, amchichDB.outbox, async () => {
        await amchichDB.streamingMessages.put(message);
        // Outbox
        await amchichDB.outbox.add(newOutbox("update", "streaming", message));
    });
}

export async function deleteStreamingMessage(conversationId: ConversationID): Promise<void> {
    await amchichDB.transaction("rw", amchichDB.streamingMessages, amchichDB.outbox, async () => {
        await amchichDB.streamingMessages.where({ conversationId }).delete();
        // Outbox
        await amchichDB.outbox.add(newOutbox("delete", "streaming", { conversationId }));
    });
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