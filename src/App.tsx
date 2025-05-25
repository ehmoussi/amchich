import { ConversationSideBar } from "./components/conversations/conversationsidebar"
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar"

function App() {
    return (
        <SidebarProvider defaultOpen={true}>
            <ConversationSideBar />
            <SidebarTrigger />
            <main className="ring-none mx-auto flex h-svh max-h-svh w-full max-w-[80rem] flex-col items-stretch border-none">
                Hello World
            </main >
        </SidebarProvider>
    )
}

export default App
