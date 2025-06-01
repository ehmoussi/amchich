import React from "react";
import { ChatTextarea } from "./chattextarea";
import { Button } from "../ui/button";
import { ArrowUp, CircleStop, Paperclip } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { addMessage, createConversation, createMessage, isConversationStreaming, type ConversationID } from "../../lib/db";
import { handleAsyncError } from "../../lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { WorkerPool } from "../../lib/workerpool";

const workerPool = new WorkerPool(3);

export function ChatForm() {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const { conversationId } = useParams<{ conversationId: ConversationID }>();
    const [text, setText] = React.useState<string>("");
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
    const navigate = useNavigate();

    const isStreaming = useLiveQuery(async (): Promise<boolean> => {
        if (!conversationId) return false;
        return await isConversationStreaming(conversationId);
    }, [conversationId]) ?? false;

    const startConversation = React.useCallback((cid: ConversationID) => {
        const userMessage = createMessage(cid, "user", text, selectedFiles, true);
        addMessage(userMessage)
            .then(() => {
                setText("");
                setSelectedFiles([]);
                workerPool.startStreaming(cid)
                    .catch((error: unknown) => {
                        handleAsyncError(error, "Failed to start the streaming");
                    });
            })
            .catch((error: unknown) => {
                handleAsyncError(error, "Failed to add the message");
            });
    }, [text, selectedFiles]);

    const submitMessage = React.useCallback(() => {
        if (text === "") return;
        if (!conversationId) {
            createConversation(true)
                .then((cid) => {
                    void navigate(`/${cid.toString()}`);
                    startConversation(cid);
                }).catch((error: unknown) => {
                    handleAsyncError(error, "Failed to create a new conversation");
                });
        } else {
            startConversation(conversationId);
        }
    }, [text, conversationId, startConversation, navigate]);

    const handleSubmit = React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isStreaming) {
            if (conversationId) workerPool.abortStreaming(conversationId).catch((error: unknown) => {
                handleAsyncError(error, "Failed to abort the conversation");
            });
        }
        else {
            submitMessage();
        }
    }, [submitMessage, isStreaming, conversationId]);



    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Shift+Enter break the line otherwise it send the message
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitMessage();
        }
    }, [submitMessage]);

    return (
        <form
            onSubmit={handleSubmit}
            className="border border-input bg-background focus-within:ring-ring/10 relative mx-6 mb-6 rounded-[10px] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-0">
            <div className="flex items-end gap-2 p-3">
                <div className="flex items-end pb-1">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            setSelectedFiles(files);
                        }}
                        hidden
                        multiple
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-12 h-12 rounded-full p-0 hover:bg-muted border-neutral-500 bg-neutral-200"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Paperclip size={28} />
                    </Button>
                </div>
                <div className="flex-1">
                    <ChatTextarea
                        value={text}
                        onKeyDown={handleKeyDown}
                        onChange={setText}
                        rows={2}
                        className="w-full resize-none bg-transparent border-none outline-none text-lg placeholder:text-muted-foreground"
                    />
                    {selectedFiles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {selectedFiles.map((file, index) => (
                                <div
                                    key={`${file.name}-${index.toString()}`}
                                    className="flex items-center gap-2 bg-muted rounded-md px-3 py-1.5 text-sm"
                                >
                                    <Paperclip size={14} className="text-muted-foreground" />
                                    <span className="text-foreground">{file.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newFiles = selectedFiles.filter((_, i) => i !== index);
                                            setSelectedFiles(newFiles);
                                        }}
                                        className="text-muted-foreground hover:text-foreground ml-1"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-end pb-1">
                    <Button
                        type="submit"
                        variant="ghost"
                        className="w-12 h-12 rounded-full p-0 hover:bg-muted disabled:opacity-50 border border-neutral-500 bg-neutral-200"
                        disabled={false}
                    >
                        {isStreaming ? <CircleStop size={28} /> : <ArrowUp size={28} />}
                    </Button>
                </div>
            </div>
        </form>
    );
}