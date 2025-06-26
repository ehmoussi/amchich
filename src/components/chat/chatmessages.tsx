import { type Message } from "../../lib/db";
import { cn } from "../../lib/utils";
import { UserMessage } from "./usermessage";
import { AssistantMessage } from "./assistantmessage";
import React from "react";

const ChatMessage = React.memo(function ({ message }: { message: Message }) {
    if (message.role === "user")
        return <UserMessage message={message} />;
    return <AssistantMessage message={message} />;
});


export function ChatMessages({ messages, className }: { messages: Message[], className?: string }) {

    return (
        <div
            className={cn("flex-1 content-center px-6", className)}
        >
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
