// from https://github.com/danfinlay/llm-architect/blob/main/documentProcessor.js

import { TextLoader } from "langchain/document_loaders/fs/text";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

export async function loadAndProcessDocuments(directoryPath, { recursive, metadataText } = {}) {
  const loader = new DirectoryLoader(directoryPath, {
    ".md": (path) => new TextLoader(path),
    ".js": (path) => new TextLoader(path),
    ".ts": (path) => new TextLoader(path),
  }, recursive);

  const docs = await loader.load();
  // const splitter = new MarkdownTextSplitter();
  const splitter = new RecursiveCharacterTextSplitter();
  const docTexts = [];

  const processDocs = async (doc) => {
    const text = doc.pageContent;
    const output = await splitter.createDocuments([text], {
      metadata: metadataText,
    });

    docTexts.push(...output);
  };

  await Promise.all(docs.map(processDocs));

  return docTexts;
}

export async function vectorStoreFromDocuments(docs, { embeddings } = {}) {
  const vectorStore = await HNSWLib.fromDocuments(
    docs,
    embeddings ?? new OpenAIEmbeddings()
  );

  return vectorStore;
}