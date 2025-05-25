import { getConversationsMetadata } from "@/lib/db";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu } from "../ui/sidebar";
import { ConversationItem } from "./conversationitem";
import { useLiveQuery } from "dexie-react-hooks";



export function ConversationItems() {
    const conversations = useLiveQuery(async () => await getConversationsMetadata());
    return (
        <SidebarContent>
            <SidebarGroup>
                <SidebarGroupLabel>Conversations</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        {
                            conversations?.map((conversation) => (
                                <ConversationItem
                                    key={conversation.id}
                                    {...conversation}
                                />
                            ))
                        }
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
    );
}