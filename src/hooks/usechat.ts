import { WorkerPool } from "../lib/workerpool";
import { handleAsyncError } from "../lib/utils";
import { addUserMessage, createConversation, createMessage, editUserMessage, type ConversationID, type UserMessage as UMessage } from "../lib/db";
import React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { MAX_TOKENS } from "../components/chat/chatformoptions";


let workerPool: WorkerPool = new WorkerPool(3);

interface ChatProps {
    text: string;
    setText: (text: string) => void;
    selectedFiles: File[];
    setSelectedFiles: (selectedFiles: File[]) => void;
    handleSubmit: (e: React.FormEvent<HTMLButtonElement>) => void;
    handleCancel: (e: React.FormEvent<HTMLButtonElement>) => void;
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function useChat(conversationId: ConversationID | undefined, editedMessage: UMessage | undefined = undefined): ChatProps {
    const [text, setText] = React.useState(editedMessage ? editedMessage.content.text : "");
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>(editedMessage ? editedMessage.content.files.metadata : []);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const maxTokens = searchParams.get("maxTokens");
    if (maxTokens) {
        if (MAX_TOKENS.includes(maxTokens)) {
            try {
                workerPool.setMaxTokens(parseInt(maxTokens));
            } catch (error: unknown) { console.error(error); }
        }
    };

    const startStreamingAnswer = React.useCallback((cid: ConversationID) => {
        setText("");
        setSelectedFiles([]);
        workerPool.startStreaming(cid)
            .catch((error: unknown) => {
                handleAsyncError(error, "Failed to start the streaming");
            });
    }, [setText, setSelectedFiles]);

    const startConversation = React.useCallback((cid: ConversationID) => {
        const userMessage = createMessage(cid, "user", text, selectedFiles, true);
        if (editedMessage)
            editUserMessage(editedMessage, userMessage)
                .then(() => {
                    startStreamingAnswer(cid);
                })
                .catch((error: unknown) => {
                    handleAsyncError(error, "Failed to edit the message");
                });
        else
            addUserMessage(userMessage)
                .then(() => {
                    startStreamingAnswer(cid);
                })
                .catch((error: unknown) => {
                    handleAsyncError(error, "Failed to add the message");
                });
    }, [text, selectedFiles, editedMessage, startStreamingAnswer]);

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

    const handleCancel = React.useCallback((e: React.FormEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (conversationId) {
            // console.log("Call abort streaming of the worker pool");
            workerPool.abortStreaming(conversationId)
                .catch((error: unknown) => {
                    handleAsyncError(error, "Failed to abort the conversation");
                });
        }
    }, [conversationId]);

    const handleSubmit = React.useCallback((e: React.FormEvent<HTMLButtonElement>) => {
        e.preventDefault();
        submitMessage();
    }, [submitMessage]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Shift+Enter break the line otherwise it send the message
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitMessage();
        }
    }, [submitMessage]);

    return { text, setText, selectedFiles, setSelectedFiles, handleSubmit, handleCancel, handleKeyDown }
}