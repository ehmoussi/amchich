import { useParams } from "react-router";
import { getConversationMessages, getStreamingMessage, type ConversationID, type Message } from "../../lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { handleAsyncError } from "../../lib/utils";
import { UserMessage } from "./usermessage";
import { AssistantMessage } from "./assistantmessage";
import React from "react";

const ChatMessage = React.memo(function ({ message }: { message: Message }) {
    if (message.role === "user")
        return <UserMessage message={message} />;
    return <AssistantMessage message={message} />;
});

export function ChatMessages() {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const prevIsStreamingRef = React.useRef<boolean>(false);
    const scrollTimeoutRef = React.useRef<NodeJS.Timeout>(null);
    const { conversationId } = useParams<{ conversationId: ConversationID }>();
    const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

    const { messages, isStreaming } = useLiveQuery(async (): Promise<{ messages: Message[], isStreaming: boolean }> => {
        if (!conversationId) return { messages: [], isStreaming: false };
        try {
            const messages = await getConversationMessages(conversationId);
            const streamingMessage = await getStreamingMessage(conversationId);
            const isStreaming = streamingMessage !== undefined;
            if (streamingMessage) {
                messages.push(streamingMessage);
            }
            return { messages, isStreaming };
        } catch (error) {
            handleAsyncError(error, "Failed to retrieve the messages");
            return { messages: [], isStreaming: false };
        }
    }, [conversationId]) ?? { messages: [], isStreaming: false };

    const handleScroll = React.useCallback(() => {
        if (!containerRef.current || !isStreaming) return;

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            setShouldAutoScroll(distanceFromBottom < 90);
        }, 20);

    }, [isStreaming]);

    React.useEffect(() => {
        if (!containerRef.current) return;
        if (!prevIsStreamingRef.current) setShouldAutoScroll(true);
        if (isStreaming && (shouldAutoScroll || !prevIsStreamingRef.current)) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
        prevIsStreamingRef.current = isStreaming;
    }, [messages, isStreaming, shouldAutoScroll]);

    return (
        <div
            ref={containerRef}
            className="flex-1 content-center overflow-y-auto px-6"
            onScroll={handleScroll}>
            <div className="my-4 flex h-fit min-h-full flex-col gap-4">
                {
                    messages.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                    ))
                }
            </div>
        </div >
    );
}
