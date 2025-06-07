import React from "react";
import { ChatTextarea } from "./chattextarea";
import { Button } from "../ui/button";
import { ArrowUp, CircleStop } from "lucide-react";
import { useParams } from "react-router";
import { isConversationStreaming, type ConversationID } from "../../lib/db";
import { useChat } from "@/hooks/usechat";
import { ChatFileTags } from "./chatfiletags";
import { useLiveQuery } from "dexie-react-hooks";
import { ChatSelectFiles } from "./chatselectfiles";


export function ChatForm() {
    const { conversationId } = useParams<{ conversationId: ConversationID }>();

    const isStreaming = useLiveQuery(async (): Promise<boolean> => {
        if (!conversationId) return false;
        return await isConversationStreaming(conversationId);
    }, [conversationId]) ?? false;

    const { text, setText, selectedFiles, setSelectedFiles, handleSubmit, handleCancel, handleKeyDown } = useChat(conversationId);

    const onClick = React.useCallback((e: React.FormEvent<HTMLButtonElement>) => {
        if (isStreaming)
            handleCancel(e);
        else
            handleSubmit(e);
    }, [isStreaming, handleSubmit, handleCancel]);

    return (
        <div
            className="border border-input bg-background focus-within:ring-ring/10 relative mx-6 mb-6 rounded-[10px] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-0">
            <div className="flex items-end gap-2 p-3">
                <ChatSelectFiles setSelectedFiles={setSelectedFiles} />
                <div className="flex-1">
                    <ChatTextarea
                        value={text}
                        onKeyDown={handleKeyDown}
                        onChange={setText}
                        placeholder="Enter a message"
                        rows={2}
                        className="w-full resize-none bg-transparent border-none outline-none text-lg placeholder:text-muted-foreground"
                    />
                    {selectedFiles.length > 0 && <ChatFileTags selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} />}
                </div>
                <div className="flex items-end pb-1">
                    <Button
                        type="submit"
                        variant="ghost"
                        className="w-12 h-12 rounded-full p-0 hover:bg-muted disabled:opacity-50 border border-neutral-500 bg-neutral-200"
                        disabled={false}
                        onClick={onClick}
                    >
                        {isStreaming ? <CircleStop size={28} /> : <ArrowUp size={28} />}
                    </Button>
                </div>
            </div>
        </div>
    );
}