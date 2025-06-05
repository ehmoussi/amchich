import React from "react"
import { ChatForm } from "./components/chat/chatform"
import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { LandingPage } from "./components/landingpage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster } from "./components/ui/sonner"
import { ChatMessages } from "./components/chat/chatmessages"
import { ChatModelSelector } from "./components/chat/chatmodelselector";
import { getOpenAIExpense } from "./lib/llmmodels"
import { handleAsyncError } from "./lib/utils"


const _MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


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

function ExpenseDisplay() {
    const [spent, setSpent] = React.useState<number | undefined>(undefined);
    const now = new Date();

    React.useEffect(() => {
        let isMounted = true;
        getOpenAIExpense()
            .then((value) => {
                if (isMounted)
                    setSpent(value);
            }).catch((error: unknown) => {
                handleAsyncError(error, "Can't retrieve the amount spent in the OpenAI provider");
            });
        return () => { isMounted = false; }
    }, []);

    if (spent === undefined) return <></>;
    return <span>Total ({_MONTHS[now.getMonth()]}): {spent.toPrecision(2)} $</span>
}


function App({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <ChatModelSelector />
            <ExpenseDisplay />
            <main className="ring-none mx-auto flex h-svh max-h-svh w-full max-w-[65rem] flex-col items-stretch border-none">
                {children}
                <Toaster richColors />
            </main >
        </SidebarProvider>
    )
}

