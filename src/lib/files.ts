
export async function readFilesAsXML(files: File[]): Promise<string> {
    let content = "Below are the files stored in an XML format each file "
    content += "has an attribute index which indicate it's index in the ";
    content += "list of files and another one indicating it's name.\n\n";
    content += "<Files>\n";
    for (const [index, file] of files.entries()) {
        content += await readFileAsXML(index + 1, file);
    }
    content += "</Files>\n";
    return content;
}

async function readFileAsXML(index: number, file: File): Promise<string> {
    let content = `<File index='${index.toString()}' name='${file.name}'`;
    if (file.type !== "")
        content += ` type='${file.type}'`;
    content += ">\n";
    const eventFn = async (): Promise<string> => {
        const reader = new FileReader();
        return await new Promise((resolve) => {
            reader.onloadend = () => {
                if (reader.result !== null)
                    resolve(reader.result.toString());
                else
                    resolve("");
            };
            reader.readAsText(file);
        });
    }
    content += await eventFn();
    content += `\n</File>\n`;
    return content;
}