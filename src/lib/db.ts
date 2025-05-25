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


interface AmchichDB extends Dexie {
    conversations: Table<Conversation, ConversationID>;
    messages: Table<Message, MessageID>;
}

const amchichDB = new Dexie("amchichDB") as AmchichDB;


amchichDB.version(1).stores({
    conversations: "id, createdAt, *firstMessageIds, lastMessageId",
    messages: "id, conversationId, role, createdAt, isActive, previousMessageId, *nextMessageIds",
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