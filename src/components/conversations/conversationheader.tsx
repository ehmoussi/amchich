import { SquarePen } from "lucide-react";
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import React from "react";
import { createConversation } from "@/lib/db";
import { toast } from "sonner";

export function ConversationHeader() {
    const newConversationClicked = React.useCallback(() => {
        createConversation(true).catch((error: unknown) => {
            console.log("Failed to create a new conversation:", error);
            toast.error("Failed to create a new conversation");
        });
    }, []);
    return (
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton onClick={newConversationClicked}>
                        <a href="#">
                            <SquarePen />
                        </a>
                        New Conversation
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>
    );
}