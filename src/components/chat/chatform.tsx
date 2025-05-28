import React from "react";
import { ChatTextarea } from "./chattextarea";
import { ChatModelSelector } from "./chatmodelselector";

export function ChatForm() {
    const [text, setText] = React.useState<string>("");
    return (
        <form
            // onSubmit={ }
            className="border-input bg-background focus-within:ring-ring/10 relative mx-6 mb-6 flex flex-col items-start rounded-[10px] border px-3 py-1.5 pr-8 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-0"
        >
            <div className="flex w-full items-center">
                <ChatTextarea
                    value={text}
                    onChange={setText}
                    rows={2}
                    className="placeholder:text-muted-foreground flex-1 bg-transparent focus:outline-none text-lg" />
                <ChatModelSelector />
            </div>
        </form>
    );
}