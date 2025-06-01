
import type React from "react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

export function MarkdownText({ children }: { children: string }) {
    const components = {
        code(props) {
            const { children, className, node, ...rest } = props
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
                <SyntaxHighlighter
                    {...rest}
                    PreTag="div"
                    children={String(children).replace(/\n$/, '')}
                    language={match[1]}
                />
            ) : (
                <code {...rest} className={className}>
                    {children}
                </code>
            )
        }
    };
    return (
        <Markdown components={components}>{children}</Markdown>
    );
}
