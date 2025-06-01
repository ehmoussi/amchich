import { SquarePen } from "lucide-react";
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import React from "react";
import { createConversation } from "@/lib/db";
import { toast } from "sonner";
import { useNavigate } from "react-router";

export function ConversationHeader() {
    const navigate = useNavigate();

    const newConversationClicked = React.useCallback(() => {
        createConversation(true)
            .then((conversationId) => {
                void navigate(`/${conversationId.toString()}`);
            })
            .catch((error: unknown) => {
                console.log("Failed to create a new conversation:", error);
                toast.error("Failed to create a new conversation");
            });
    }, [navigate]);

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