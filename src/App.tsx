import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"
import { Toaster } from "./components/ui/sonner"

function App() {
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <main className="ring-none mx-auto flex h-svh max-h-svh w-full max-w-[80rem] flex-col items-stretch border-none">
                Hello World
                <Toaster richColors />
            </main >
        </SidebarProvider>
    )
}

export default App
