import type React from "react"
import { ChatForm } from "./components/chat/chatform"
import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { LandingPage } from "./components/landingpage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster } from "./components/ui/sonner"
import { ChatMessages } from "./components/chat/chatmessages"
import { ChatModelSelector } from "./components/chat/chatmodelselector";


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
            <ChatModelSelector />
            <main className="ring-none mx-auto flex h-svh max-h-svh w-full max-w-[65rem] flex-col items-stretch border-none">
                {children}
                <Toaster richColors />
            </main >
        </SidebarProvider>
    )
}

