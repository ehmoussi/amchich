import React from "react";
import type { UserMessage as UMessage } from "../../lib/db";
import { MarkdownText } from "../ui/markdowntext";

export const UserMessage = React.memo(function UserMessage({ message }: { message: UMessage }) {
    return (
        <div className="group flex flex-col">
            <div
                className="max-w-[95%] rounded-lg px-3 py-2 text-lg whitespace-pre-line self-end border border-neutral-500 bg-neutral-50 text-black"
            >
                <MarkdownText>{message.content.text}</MarkdownText>
            </div>
        </div>
    );
});
