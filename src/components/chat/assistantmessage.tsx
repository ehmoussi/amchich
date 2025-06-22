import { ChevronsUpDown, Loader } from "lucide-react";
import type { AssistantMessage as AMessage } from "../../lib/db";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { MarkdownText } from "../ui/markdowntext";
import React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { Button } from "../ui/button";

export function AssistantMessage({ message }: { message: AMessage }) {
    return (
        <div className="group flex flex-col">
            <ScrollArea
                className="max-w-[95%] rounded-md shadow-sm px-3 py-2 text-sm whitespace-pre-line self-start border-indigo-100 border text-black"
            >
                {
                    message.content.thinking &&
                    <ThinkingMessage thinking={message.content.thinking} />
                }
                {
                    message.content.text ?
                        <MarkdownText>{message.content.text}</MarkdownText> :
                        <div className="flex px-3"><Loader className="animate-spin" /><span>Processing...</span></div>
                }
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div >
    );
}


const ThinkingMessage = React.memo(function ({ thinking }: { thinking: string }) {
    const [isOpen, setIsOpen] = React.useState<boolean>(true);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="opacity-60">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                    <ChevronsUpDown size={6} />
                    <span className="text-sm">Thinking ...</span>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-w-[80%] rounded-md px-4 pb-6 self-start border-black-100 border text-sm">
                {thinking}
            </CollapsibleContent>
        </Collapsible >
    );
});

