import React from "react";
import { EllipsisVertical } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { type ConversationID } from "../../lib/db";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../ui/dropdown-menu";


export const MAX_TOKENS = ["1000", "2000", "3000", "4000", "5000", "6000", "7000", "8000", "9000", "10000"];


export const ChatFormOptions = React.memo(function () {
    const { conversationId } = useParams<{ conversationId: ConversationID }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const currentMaxTokens = searchParams.get("maxTokens") ?? MAX_TOKENS[1];
    return (
        <div className="flex items-end gap-2 p-3">
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <DropdownMenuLabel>Max Tokens</DropdownMenuLabel>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {
                                MAX_TOKENS.map((maxTokens) => (
                                    <DropdownMenuCheckboxItem
                                        key={`key-${maxTokens}`}
                                        checked={currentMaxTokens === maxTokens}
                                        onCheckedChange={() => void navigate(`/${conversationId ?? ""}?maxTokens=${maxTokens}`)}>
                                        {maxTokens}
                                    </DropdownMenuCheckboxItem>
                                ))
                            }
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
});
