import { ConversationItems } from "./conversationitems";
import { ConversationHeader } from "./conversationheader";
import { Sidebar } from "../ui/sidebar";

export function ConversationSideBar() {
    return (
        <Sidebar>
            <ConversationHeader />
            <ConversationItems />
        </Sidebar >
    );
}