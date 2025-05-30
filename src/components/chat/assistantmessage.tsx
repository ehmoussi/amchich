import type { AssistantMessage as AMessage } from "../../lib/db";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";

export function AssistantMessage({ message }: { message: AMessage }) {
    return (
        <div className="group flex flex-col">
            <ScrollArea
                className="max-w-[95%] rounded-md shadow-sm px-3 py-2 text-lg whitespace-pre-line self-start border-indigo-100 border text-black"
            >
                {message.content.text}
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div >
    );
}