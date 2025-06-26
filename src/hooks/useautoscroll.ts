import type { Message } from "../lib/db";
import React from "react";

export function useAutoScroll(messages: Message[], isStreaming: boolean): { containerRef: React.RefObject<HTMLDivElement | null>, handleScroll: () => void } {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const prevIsStreamingRef = React.useRef<boolean>(false);
    const scrollTimeoutRef = React.useRef<NodeJS.Timeout>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

    const handleScroll = React.useCallback(() => {
        if (!containerRef.current || !isStreaming) return;

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            setShouldAutoScroll(distanceFromBottom < 90);
        }, 20);

    }, [isStreaming]);

    React.useEffect(() => {
        if (!containerRef.current) return;
        if (!prevIsStreamingRef.current) setShouldAutoScroll(true);
        if (isStreaming && (shouldAutoScroll || !prevIsStreamingRef.current)) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
        prevIsStreamingRef.current = isStreaming;
    }, [messages, isStreaming, shouldAutoScroll]);

    return { containerRef, handleScroll }
}