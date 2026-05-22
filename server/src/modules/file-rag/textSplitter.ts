import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,       // characters per chunk
    chunkOverlap: 100,
});

export async function splitTextIntoChunks(text: string): Promise<string[]> {
    const docs = await splitter.createDocuments([text]);
    return docs.map((doc) => doc.pageContent);
}