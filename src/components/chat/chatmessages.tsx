import { useParams } from "react-router";
import { getConversationMessages, type ConversationID, type Message } from "../../lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { handleAsyncError } from "../../lib/utils";
import { UserMessage } from "./usermessage";
import { AssistantMessage } from "./assistantmessage";
import { StreamingMessage } from "./streamingmessage";

function ChatMessage({ message }: { message: Message }) {
    if (message.role === "user")
        return <UserMessage message={message} />;
    return <AssistantMessage message={message} />;
}

export function ChatMessages() {
    const { conversationId } = useParams<{ conversationId: ConversationID }>();

    const messages = useLiveQuery(async (): Promise<Message[]> => {
        if (!conversationId) return [];
        try {
            return await getConversationMessages(conversationId);
        } catch (error) {
            handleAsyncError(error, "Failed to retrieve the messages");
            return [];
        }
    }, [conversationId]);

    return (
        <div className="flex-1 content-center overflow-y-auto px-6">
            <div className="my-4 flex h-fit min-h-full flex-col gap-4">
                {
                    messages?.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                    ))
                }
                <StreamingMessage />
            </div>
        </div>
    );
}