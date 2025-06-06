import { useParams } from "react-router";
import { getConversationMessages, getStreamingMessage, type ConversationID, type Message } from "../../lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { handleAsyncError } from "../../lib/utils";
import { UserMessage } from "./usermessage";
import { AssistantMessage } from "./assistantmessage";
import React from "react";

function ChatMessage({ message }: { message: Message }) {
    if (message.role === "user")
        return <UserMessage message={message} />;
    return <AssistantMessage message={message} />;
}

export function ChatMessages() {
    const bottomRef = React.useRef<HTMLDivElement | null>(null);
    const { conversationId } = useParams<{ conversationId: ConversationID }>();

    const messages = useLiveQuery(async (): Promise<Message[]> => {
        if (!conversationId) return [];
        try {
            const messages = await getConversationMessages(conversationId);
            const streamingMessage = await getStreamingMessage(conversationId);
            if (streamingMessage) messages.push(streamingMessage);
            return messages;
        } catch (error) {
            handleAsyncError(error, "Failed to retrieve the messages");
            return [];
        }
    }, [conversationId]);

    React.useEffect(() => {
        if (conversationId && bottomRef.current)
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }, [conversationId, messages]);

    return (
        <div className="flex-1 content-center overflow-y-auto px-6">
            <div className="my-4 flex h-fit min-h-full flex-col gap-4">
                {
                    messages?.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                    ))
                }
                <div ref={bottomRef}></div>
            </div>
        </div>
    );
}
