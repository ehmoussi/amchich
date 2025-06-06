import React from "react";
import { isConversationStreaming, type UserMessage as UMessage } from "../../lib/db";
import { MarkdownText } from "../ui/markdowntext";
import { Copy, Pencil } from "lucide-react";
import { ChatTextarea } from "./chattextarea";
import { useChat } from "@/hooks/usechat";
import { Button } from "../ui/button";
import { ChatFileTags } from "./chatfiletags";
import { useLiveQuery } from "dexie-react-hooks";
import { handleAsyncError } from "@/lib/utils";
import { ChatSelectFiles } from "./chatselectfiles";

function EditingMessage({ message, isStreaming, setIsEditing }: { message: UMessage, isStreaming: boolean, setIsEditing: (isEditing: boolean) => void }) {
    const {
        text,
        setText,
        selectedFiles,
        setSelectedFiles,
        handleSubmit,
        handleKeyDown
    } = useChat(
        message.conversationId,
        isStreaming,
        message.content.text,
        message.content.files.metadata
    );

    const handleCancel = React.useCallback(() => {
        setText(message.content.text);
        setIsEditing(false);
    }, [message.content.text, setIsEditing, setText]);

    return (
        <div className="border border-neutral-500 rounded-[10px] flex items-start p-3 gap-2">
            <ChatSelectFiles setSelectedFiles={setSelectedFiles} />
            <div className="w-full flex flex-col">
                <div className="flex items-end gap-2 p-3">
                    <div className="flex-1">
                        <ChatTextarea
                            onKeyDown={handleKeyDown}
                            onChange={setText}
                            value={text}
                            placeholder="Enter a message"
                            rows={2}
                            className="border border-neutral-100 w-full rounded-[10px] p-2 resize-none bg-transparent outline-none text-lg placeholder:text-muted-foreground"
                        />
                    </div>
                </div>
                <div className="flex gap-2 mt-2 w-full">
                    <div className="flex-1">
                        {selectedFiles.length > 0 && <ChatFileTags selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} />}
                    </div>
                    <div className="flex flex-col-reverse gap-2 mt-2">
                        <div className="flex justify-end">
                            <Button
                                variant="ghost"
                                onClick={handleCancel}
                                className="text-lg px-3 py-1 h-auto"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                className="bg-neutral-500 text-lg hover:bg-black text-white px-3 py-1 h-auto"
                            >
                                Submit
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export const UserMessage = React.memo(function UserMessage({ message }: { message: UMessage }) {
    const [isHovering, setIsHovering] = React.useState<boolean>(false);
    const [isEditing, setIsEditing] = React.useState(false);

    const isStreaming = useLiveQuery(async (): Promise<boolean> => {
        return await isConversationStreaming(message.conversationId);
    }, [message.conversationId]) ?? false;


    if (isEditing)
        return (
            <div className="group flex flex-col"
                onMouseEnter={() => { setIsHovering(!isStreaming) }}
                onMouseLeave={() => { setIsHovering(false) }}
            >
                < EditingMessage message={message} isStreaming={isStreaming} setIsEditing={setIsEditing} />
            </div >
        );

    return (
        <div className="group flex flex-col"
            onMouseEnter={() => { setIsHovering(!isStreaming) }}
            onMouseLeave={() => { setIsHovering(false) }}
        >
            <div
                className="max-w-[95%] rounded-lg px-3 py-2 text-lg whitespace-pre-line self-end border border-neutral-500 bg-neutral-50 text-black"

            >
                <MarkdownText>{message.content.text}</MarkdownText>
            </div>
            <div
                className="flex gap-1 justify-end mt-1 opacity-70"
                style={{ visibility: isHovering ? 'visible' : 'hidden' }}>
                <button
                    type="button"
                    onClick={() => {
                        navigator.clipboard.writeText(message.content.text)
                            .catch((error: unknown) => {
                                handleAsyncError(error, "Failed to copy in the clipboard");
                            })
                    }}
                    className="p-1 rounded hover:bg-black/10"
                    aria-label="Copy message"
                >
                    <Copy size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => { setIsEditing(true); }}
                    className="p-1 rounded hover:bg-black/10"
                    aria-label="Edit message"
                >
                    <Pencil size={16} />
                </button>
            </div>
        </div >
    );
});
