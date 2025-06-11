
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { CopyButton } from "../chat/copybutton";

export function MarkdownText({ children }: { children: string }) {
    const components = {
        code(props: any) {
            const { children, className, node, ...rest } = props
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
                <div>
                    <SyntaxHighlighter
                        {...rest}
                        PreTag="div"
                        children={String(children).replace(/\n$/, '')}
                        language={match[1]}
                    />
                    <CopyButton text={String(children).replace(/\n$/, '')} />
                </div>
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
