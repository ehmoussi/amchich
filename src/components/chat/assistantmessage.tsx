import { ChevronsUpDown, Loader } from "lucide-react";
import type { AssistantMessage as AMessage } from "../../lib/db";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { MarkdownText } from "../ui/markdowntext";
import React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { Button } from "../ui/button";
import { CopyButton } from "./copybutton";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function AssistantMessage({ message }: { message: AMessage }) {
    const [isHovering, setIsHovering] = React.useState<boolean>(false);
    const isMobile = useIsMobile();
    const iconSize = isMobile ? 10 : 12;

    return (
        <div className="group flex flex-col"
            onMouseEnter={() => { setIsHovering(true) }}
            onMouseLeave={() => { setIsHovering(false) }}
        >
            <ScrollArea
                className={
                    cn(
                        "max-w-[95%] rounded-md shadow-sm px-3 py-2 text-sm whitespace-pre-line self-start",
                        message.isError ? "border-red-100 border text-red-500" : "border-indigo-100 border text-black"
                    )}
            >
                <span>{message.isError}</span>
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
            <div className="flex gap-1 justify-start items-center mt-1 opacity-70 text-xs" hidden={!isHovering}>
                <CopyButton text={message.content.text} iconSize={iconSize} />
                <AssistantMessageUsage message={message} />
            </div>
        </div >
    );
}

const AssistantMessageUsage = React.memo(function ({ message }: { message: AMessage }) {
    const usage = message.openRouterInfos?.usage;
    const isMobile = useIsMobile();
    const modelName = isMobile ? message.modelId?.split("/")[1] : message.modelId;
    return (
        <>
            {
                isMobile ?
                    <span>{modelName}</span> :
                    <span>Model: {modelName}</span>
            }
            {
                usage?.cost !== undefined &&
                (
                    isMobile ?
                        <span>| ${usage.cost}</span> :
                        <span>| Cost: ${usage.cost}</span>
                )
            }
            {
                usage?.prompt_tokens &&
                (
                    isMobile ?
                        <span>| I: {usage.prompt_tokens}</span> :
                        <span>| Input Tokens: {usage.prompt_tokens}</span>
                )
            }
            {
                usage?.completion_tokens &&
                (
                    isMobile ?
                        <span>| O: {usage.completion_tokens}</span> :
                        <span>| Output Tokens: {usage.completion_tokens}</span>
                )
            }
            {
                usage?.reasoning_tokens !== undefined &&
                (
                    isMobile ?
                        <span>| R: {usage.reasoning_tokens}</span> :
                        <span>| Reasoning Tokens: {usage.reasoning_tokens}</span>
                )
            }
        </>
    );
});


const ThinkingMessage = React.memo(function ({ thinking }: { thinking: string }) {
    const [isOpen, setIsOpen] = React.useState<boolean>(false);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="opacity-60">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                    <ChevronsUpDown size={6} />
                    <span className="text-sm">Thinking ...</span>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-w-[80%] rounded-md px-4 pb-6 pt-4 self-start border-black-100 border text-sm">
                {thinking}
            </CollapsibleContent>
        </Collapsible >
    );
});

