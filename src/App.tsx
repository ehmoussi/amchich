import React from "react"
import { ChatForm } from "./components/chat/chatform"
import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { LandingPage } from "./components/landingpage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster } from "./components/ui/sonner"
import { ChatMessages } from "./components/chat/chatmessages"
import { ModelSelector } from "./components/models/modelselector";
import { Expense } from "./components/models/expense"


export function AppConversation() {
    return (
        <App>
            <ChatMessages />
            <ChatForm />
        </App>);
}

export function AppLandingPage() {
    return (
        <App>
            <LandingPage />
            <ChatForm />
        </App>
    );
}


function App({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <div>
                <ModelSelector />
                <Expense />
            </div>
            <main className="ring-none mx-auto flex h-svh max-h-svh w-full max-w-[75rem] flex-col items-stretch border-none">
                {children}
                <Toaster richColors />
            </main >
        </SidebarProvider>
    )
}

