import React from "react";
import { getSiblings, isConversationStreaming, updateActiveMessage, type UserMessage as UMessage } from "../../lib/db";
import { MarkdownText } from "../ui/markdowntext";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { ChatTextarea } from "./chattextarea";
import { useChat } from "@/hooks/usechat";
import { Button } from "../ui/button";
import { ChatFileTags } from "./chatfiletags";
import { useLiveQuery } from "dexie-react-hooks";
import { handleAsyncError } from "@/lib/utils";
import { ChatSelectFiles } from "./chatselectfiles";
import { CopyButton } from "./copybutton";
import { useIsMobile } from "@/hooks/use-mobile";


interface EditingMessageProps {
    message: UMessage;
    setIsEditing: (isEditing: boolean) => void;
}

const EditingMessage = React.memo(function ({ message, setIsEditing }: EditingMessageProps) {
    const {
        text,
        setText,
        selectedFiles,
        setSelectedFiles,
        handleSubmit,
        handleKeyDown
    } = useChat(message.conversationId, message);

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
                            className="border border-neutral-100 w-full rounded-[10px] p-2 resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground"
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
                                className="text-sm px-3 py-1 h-auto"
                                aria-label="Cancel"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                className="bg-neutral-500 text-sm hover:bg-black text-white px-3 py-1 h-auto"
                                aria-label="Submit"
                            >
                                Submit
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export const UserMessage = React.memo(function UserMessage({ message }: { message: UMessage }) {
    const [isHovering, setIsHovering] = React.useState<boolean>(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const isMobile = useIsMobile();
    const iconSize = isMobile ? 10 : 12;

    const isStreaming = useLiveQuery(async (): Promise<boolean> => {
        return await isConversationStreaming(message.conversationId);
    }, [message.conversationId]) ?? false;


    if (isEditing)
        return (
            <div className="group flex flex-col">
                <EditingMessage message={message} setIsEditing={setIsEditing} />
            </div >
        );

    return (
        <div className="group flex flex-col"
            onMouseEnter={() => { setIsHovering(!isStreaming) }}
            onMouseLeave={() => { setIsHovering(false) }}
        >
            <div
                className="max-w-[95%] rounded-lg px-3 py-2 text-sm whitespace-pre-line self-end border border-neutral-500 bg-sidebar text-black"
            >
                <MarkdownText>{message.content.text}</MarkdownText>
                {message.content.files.metadata.length > 0 &&
                    <div className="flex-1">
                        <ChatFileTags selectedFiles={message.content.files.metadata} />
                    </div>
                }
            </div>
            <div
                className="flex gap-1 justify-end mt-1 opacity-70"
                style={{ visibility: isHovering ? 'visible' : 'hidden' }}>
                <CopyButton text={message.content.text} iconSize={iconSize} />
                <button
                    type="button"
                    onClick={() => { setIsEditing(true); }}
                    className="p-1 rounded hover:bg-black/10"
                    aria-label="Edit message"
                >
                    <Pencil size={iconSize} />
                </button>
                <MessagePagination message={message} iconSize={iconSize} />
            </div>
        </div >
    );
});


const MessagePagination = React.memo(function ({ message, iconSize }: { message: UMessage, iconSize: number }) {
    const siblings = useLiveQuery(async () => {
        try {
            return await getSiblings(message);
        } catch {
            return [];
        }
    }, [message]);

    const currentPage = siblings?.findIndex((mid) => mid === message.id);
    const nbPages = siblings?.length;

    const moveToPreviousMessage = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (currentPage !== undefined && siblings) {
            updateActiveMessage(message.id, siblings[currentPage - 1])
                .catch((error: unknown) => {
                    handleAsyncError(error, "Failed to move to the previous message");
                });
        }
    }, [siblings, currentPage, message.id]);

    const moveToNextMessage = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (currentPage !== undefined && siblings) {
            updateActiveMessage(message.id, siblings[currentPage + 1])
                .catch((error: unknown) => {
                    handleAsyncError(error, "Failed to move to the next message");
                });
        }
    }, [siblings, currentPage, message.id]);

    if (siblings === undefined || currentPage === undefined || nbPages === undefined) return;

    const isPreviousDisabled = currentPage <= 0;
    const isNextDisabled = currentPage >= (siblings.length - 1);

    return (
        <div className="flex items-center">
            <button
                type="button"
                disabled={isPreviousDisabled}
                onClick={moveToPreviousMessage}
                className={`p-1 rounded ${isPreviousDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-black/10"}`}
                aria-label="Previous message">
                <ChevronLeft size={iconSize} />
            </button>
            <span className="text-xs">{currentPage + 1} / {nbPages}</span>
            <button
                type="button"
                disabled={isNextDisabled}
                onClick={moveToNextMessage}
                className={`p-1 rounded ${isNextDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-black/10"}`}
                aria-label="Next message">
                <ChevronRight size={iconSize} />
            </button >
        </div>
    );
});
