import React from "react"
import { ChatForm } from "./components/chat/chatform"
import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { LandingPage } from "./components/landingpage"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster } from "./components/ui/sonner"
import { ChatMessages } from "./components/chat/chatmessages"
import { ChatModelSelector } from "./components/chat/chatmodelselector";
import { getOpenAIExpense, getOpenRouterExpense } from "./lib/llmmodels"
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
    const [openAISpent, setOpenAISpent] = React.useState<number | undefined>(undefined);
    const [openRouterSpent, setOpenRouterSpent] = React.useState<number | undefined>(undefined);
    const now = new Date();

    React.useEffect(() => {
        let isMounted = true;

        getOpenAIExpense()
            .then((value) => {
                if (isMounted)
                    setOpenAISpent(value);
            }).catch((error: unknown) => {
                handleAsyncError(error, "Can't retrieve the amount spent in the OpenAI provider");
            });
        getOpenRouterExpense()
            .then((value) => {
                setOpenRouterSpent(value);
            })
            .catch((error: unknown) => {
                handleAsyncError(error, "Can't retrieve the amount spent in the OpenRouter provider");
            });

        return () => { isMounted = false; }
    }, []);

    if (openAISpent === undefined || openRouterSpent === undefined) return;
    return (
        <div className="flex flex-col">
            <span>Total (OpenAI) ({_MONTHS[now.getMonth()]}): {openAISpent.toPrecision(2)} $</span>
            <span>Total (OpenRouter) ({_MONTHS[now.getMonth()]}): {openRouterSpent.toPrecision(2)} $</span>
        </div>
    );
}


function App({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <div>
                <ChatModelSelector />
                <ExpenseDisplay />
            </div>
            <main className="ring-none mx-auto flex h-svh max-h-svh w-full max-w-[65rem] flex-col items-stretch border-none">
                {children}
                <Toaster richColors />
            </main >
        </SidebarProvider>
    )
}

