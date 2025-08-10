
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { CopyButton } from "../chat/copybutton";
import remarkGfm from "remark-gfm";


export function MarkdownText({ children, iconSize }: { children: string, iconSize: number }) {
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
                    <CopyButton text={String(children).replace(/\n$/, '')} iconSize={iconSize} />
                </div>
            ) : (
                <code {...rest} className={className}>
                    {children}
                </code>
            )
        }
    };
    return (
        <Markdown remarkPlugins={[remarkGfm]} components={components}>{children}</Markdown>
    );
}
