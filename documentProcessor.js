// from https://github.com/danfinlay/llm-architect/blob/main/documentProcessor.js

import { DirectoryLoader, TextLoader } from "langchain/document_loaders";
import { MarkdownTextSplitter } from "langchain/text_splitter";
import { HNSWLib } from "langchain/vectorstores";
import { OpenAIEmbeddings } from "langchain/embeddings";

export async function loadAndProcessDocuments(directoryPath, { recursive, metadataText, embeddings } = {}) {
  const loader = new DirectoryLoader(directoryPath, {
    ".md": (path) => new TextLoader(path),
    ".js": (path) => new TextLoader(path),
  }, recursive);

  const docs = await loader.load();
  const splitter = new MarkdownTextSplitter();
  const docTexts = [];

  const processDocs = async (doc) => {
    const text = doc.pageContent;
    const output = await splitter.createDocuments([text], {
      metadata: metadataText,
    });

    docTexts.push(...output);
  };

  await Promise.all(docs.map(processDocs));

  const vectorStore = await HNSWLib.fromDocuments(
    docTexts,
    embeddings ?? new OpenAIEmbeddings()
  );

  return vectorStore;
}