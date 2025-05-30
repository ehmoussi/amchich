import { MoreHorizontal, Pencil, Trash } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { type ConversationID, deleteConversation, updateConversationTitle, type ConversationMeta } from "../../lib/db";
import React from "react";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { Link, useNavigate, useParams } from "react-router";
import { handleAsyncError } from "../../lib/utils";

const CONVERSATION_TITLE_MAX_LENGTH = 100;

export const ConversationItem = React.memo(
    ({ id: conversationId, title: conversationTitle }: ConversationMeta) => {
        const { conversationId: currentConversationId } = useParams<{ conversationId: ConversationID }>();
        const inputRef = React.useRef<HTMLInputElement>(null);
        const [title, setTitle] = React.useState(conversationTitle);
        const [isEditing, setIsEditing] = React.useState(false);
        const navigate = useNavigate();

        const isActive = conversationId === currentConversationId;

        const beginEditing = React.useCallback(() => {
            setIsEditing(true);
        }, []);

        const titleChanged = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
            setTitle(e.target.value);
        }, []);

        const dismissTitle = React.useCallback(() => {
            setIsEditing(false);
            setTitle(conversationTitle);
        }, [conversationTitle]);

        const acceptTitle = React.useCallback(() => {
            const trimmedTitle = title.trim();
            if (trimmedTitle === "") {
                dismissTitle();
                toast.warning("An empty title is forbidden");
                return;
            }
            if (trimmedTitle.length > CONVERSATION_TITLE_MAX_LENGTH) {
                dismissTitle();
                toast.warning(`Title cannot exceed ${CONVERSATION_TITLE_MAX_LENGTH.toString()} characters`);
                return;
            }
            setIsEditing(false);
            updateConversationTitle(conversationId, trimmedTitle).catch((error: unknown) => {
                handleAsyncError(error, "Failed to update conversation title");
                dismissTitle();
            });
        }, [conversationId, title, dismissTitle]);

        const editConversationSubmitted = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                acceptTitle();
            } else if (e.key === "Escape") {
                dismissTitle();
            }
        }, [acceptTitle, dismissTitle]);

        const deleteConversationClicked = React.useCallback(() => {
            deleteConversation(conversationId)
                .then(() => {
                    if (isActive) {
                        // Return to the home page if the current conversation is deleted
                        navigate("/")?.catch((error: unknown) => {
                            handleAsyncError(error, "Failed to navigate to the home page");
                        });
                    }
                })
                .catch((error: unknown) => {
                    handleAsyncError(error, "Failed to delete conversation");
                });
        }, [conversationId, isActive, navigate]);

        React.useEffect(() => {
            if (isEditing) inputRef.current?.focus();
        }, [isEditing, inputRef]);

        React.useEffect(() => {
            setTitle(conversationTitle);
        }, [conversationTitle]);


        return (
            <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={title} isActive={isActive}>
                    {
                        isEditing ?
                            <Input
                                ref={inputRef}
                                type="text"
                                placeholder="Edit conversation"
                                aria-label="Edit conversation"
                                value={title}
                                onChange={titleChanged}
                                onKeyDown={editConversationSubmitted}
                                onBlur={acceptTitle}
                            /> :
                            <Link to={`/${conversationId}`}>
                                <span className="text-lg">{title}</span>
                            </Link>
                    }
                </SidebarMenuButton >
                {
                    !isEditing &&
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild aria-label="Conversation options">
                            <SidebarMenuAction showOnHover={true}>
                                <MoreHorizontal />
                            </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                            <DropdownMenuItem onClick={beginEditing} aria-label="Edit conversation">
                                <Pencil />
                                <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={deleteConversationClicked} aria-label="Delete conversation">
                                <Trash />
                                <span>Delete</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            </SidebarMenuItem >
        );
    }
);