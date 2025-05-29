import type { UUID } from "crypto";
import { Dexie, type Table } from "dexie";

export type ConversationID = UUID;
export type MessageID = UUID;
type Role = "user" | "assistant";


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
    content: string; // Concatenation of the files to present to the LLM
}

interface MessageContent {
    message: string;
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
    nextMessageIds?: MessageID;
}


interface AssistantMessage extends BaseMessage {
    role: "assistant";
    isActive: true;
}

interface UserMessage extends BaseMessage {
    role: "user";
    isActive: boolean;
}

export type Message = AssistantMessage | UserMessage;



export type LLMID = string;
export type LLMProvider = "Ollama" | "OpenAI";

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
    models: Table<LLMModel, LLMID>;
}

const amchichDB = new Dexie("amchichDB") as AmchichDB;


amchichDB.version(1).stores({
    conversations: "id, createdAt, *firstMessageIds, lastMessageId",
    messages: "id, conversationId, role, createdAt, isActive, previousMessageId, *nextMessageIds",
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


export async function getLLMModelsByProvider(): Promise<Map<LLMProvider, LLMModel[]>> {
    const modelsByProvider = new Map();
    const models = await amchichDB.models.orderBy("name").toArray();
    for (const model of models) {
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
