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
        </App>);
}

export function AppLandingPage() {
    return (
        <App>
            <LandingPage />
        </App>
    );
}


function App({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <main className="h-screen flex flex-col w-full max-w-[80rem]">
                <div className="flex-1 overflow-auto">
                    <div className="flex sticky inset-x-0 top-0 w-full bg-white z-10 mx-5 py-2 border-b">
                        <div className="flex items-center ">
                            <ModelSelector />
                            <Expense />
                        </div>
                    </div>
                    <div className="mx-5 ring-none  flex h-svh max-h-svh w-full max-w-[75rem] flex-col items-stretch border-none">
                        {children}
                        <Toaster richColors />
                    </div>
                </div>
                <div className="sticky inset-x-0 bottom-0 w-full">
                    <ChatForm className="max-w-[75rem] border border-input bg-background focus-within:ring-ring/10 mx-6 mb-6" />
                </div>
            </main>
        </SidebarProvider >
    )
}

