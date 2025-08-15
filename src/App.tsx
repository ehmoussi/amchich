import React from "react"
import { ChatForm } from "./components/chat/chatform"
import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { LandingPage } from "./components/landingpage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster } from "./components/ui/sonner"
import { ChatMessages } from "./components/chat/chatmessages"
import { ModelSelector } from "./components/models/modelselector";
import { Expense } from "./components/models/expense"
import { useParams } from "react-router";
import { clearOutboxEvents, getConversationMessages, getOutboxEvents, getStreamingMessage, updateLastEventId, type ConversationID, type Message } from "./lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { handleAsyncError } from "./lib/utils";
import { useAutoScroll } from "./hooks/useautoscroll"
import { getToken } from "./lib/tokenutils"

export function AppConversation() {
    const { conversationId } = useParams<{ conversationId: ConversationID }>();

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

    const { containerRef, handleScroll } = useAutoScroll(messages, isStreaming);

    return (
        <App
            ref={containerRef}
            onScroll={handleScroll}
        >
            <ChatMessages messages={messages} />
        </App>);
}

export function AppLandingPage() {
    return (
        <App>
            <LandingPage />
        </App>
    );
}


function App({ children, ref, onScroll }: { children: React.ReactNode, ref?: React.RefObject<HTMLDivElement | null>, onScroll?: React.UIEventHandler<HTMLElement> }) {
    // useLiveQuery(async (): Promise<void> => {
    //     const events = await getOutboxEvents();
    //     if (events.length === 0) return;

    //     const controller = new AbortController();
    //     try {
    //         const token = await getToken(controller.signal);
    //         if (token) {
    //             const body = JSON.stringify(events);
    //             const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/events`,
    //                 {
    //                     method: "POST",
    //                     headers: {
    //                         "Content-Type": "application/json",
    //                         Authorization: `Bearer ${token}`
    //                     },
    //                     signal: controller.signal,
    //                     body,
    //                 },
    //             );
    //             const content = await response.json();
    //             console.log("content", content);
    //             if (!response.ok) {
    //                 throw new Error(`Synchronization failed with status ${response.status}:\n${content}`);
    //             } else if (content.lastEventId !== undefined) {
    //                 await updateLastEventId(content.lastEventId);
    //             }
    //             // Clear the events
    //             await clearOutboxEvents();
    //         }
    //     } catch (error: any) {
    //         if (error?.name !== "AbortError")
    //             handleAsyncError(error, "Synchonization failed unexpectedly");
    //     }
    // }, []);

    // React.useEffect(() => {
    //     if (controllerRef.current)
    //         controllerRef.current.abort();

    //     return () => controller.abort();
    // }, [events]);
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <main className="h-screen flex flex-col w-full max-w-[80rem]">
                <div className="flex sticky inset-x-0 top-0 w-full bg-white z-10 mx-5 py-2 border-b">
                    <div className="flex items-center">
                        <ModelSelector />
                        <Expense />
                    </div>
                </div>
                <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto">
                    <div className="pt-5 mb-20 mx-5 ring-none flex w-full max-w-[75rem] flex-col">
                        {children}
                        <Toaster richColors />
                    </div>
                </div>
                <div className="sticky inset-x-0 bottom-0 w-full">
                    <ChatForm className="max-w-[75rem] border border-input bg-background focus-within:ring-ring/10 mx-6 mb-6" />
                </div>
            </main>
        </SidebarProvider>
    )
}

