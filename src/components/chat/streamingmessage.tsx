import { type ConversationID, type AssistantMessage as AMessage, getStreamingMessage } from "../../lib/db";
import React from "react";
import { useParams } from "react-router";
import { AssistantMessage } from "./assistantmessage";
import { useLiveQuery } from "dexie-react-hooks";

export function StreamingMessage() {
    const { conversationId } = useParams<{ conversationId: ConversationID }>();
    const bottomRef = React.useRef<HTMLDivElement | null>(null);

    const streamingMessage = useLiveQuery(async (): Promise<AMessage | undefined> => {
        if (!conversationId) return undefined;
        return await getStreamingMessage(conversationId);
    }, [conversationId]);

    React.useEffect(() => {
        if (bottomRef.current)
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }, [conversationId, streamingMessage]);

    if (!conversationId || !streamingMessage) return (<div ref={bottomRef}></div>);

    return (
        <>
            <AssistantMessage message={streamingMessage} />
            <div ref={bottomRef}></div>
        </>
    );
}
