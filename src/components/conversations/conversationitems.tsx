import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu } from "../ui/sidebar";
import { ConversationItem } from "./conversationitem";


const conversations = [
    {
        conversationId: crypto.randomUUID(),
        title: "Conversation 1",
        isActive: true
    },
    {
        conversationId: crypto.randomUUID(),
        title: "Conversation 2",
        isActive: false
    },
    {
        conversationId: crypto.randomUUID(),
        title: "Conversation 3",
        isActive: false
    }
];


export function ConversationItems() {
    return (
        <SidebarContent>
            <SidebarGroup>
                <SidebarGroupLabel>Conversations</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        {
                            conversations.map((c) => (
                                <ConversationItem
                                    key={c.conversationId}
                                    conversationId={c.conversationId}
                                    title={c.title}
                                    isActive={c.isActive}
                                />
                            ))
                        }
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
    );
}