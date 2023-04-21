import { config as loadEnvFile } from 'dotenv';
import axios from 'axios';
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from 'langchain/prompts';
import { RetrievalQAChain, loadSummarizationChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
// import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { VectorStoreQATool } from "langchain/tools";
import { fixForAzure } from './azure-fix.js';
import { setupAxiosDebugging } from './axios-debug.js';
import { getAllCommits, gitShow } from './util.js';
import { iterate, parallelMapToQueue } from './gtor.js';
import { loadAndProcessDocuments, vectorStoreFromDocuments } from './documentProcessor.js';
import { GitTool } from './git-tool.js';

// parse command arguments
const [,,targetDirectory, question] = process.argv;
if (!targetDirectory) {
  throw new Error('Please provide a target directory as the first argument');
}
if (!question) {
  throw new Error('Please provide a question as the second argument');
}

// load configuration
loadEnvFile();
const apiKey = process.env.OPENAI_API_KEY;
const apiBase = process.env.OPENAI_API_BASE;
const apiType = process.env.OPENAI_API_TYPE;
const apiVersion = process.env.OPENAI_API_VERSION;
const openAiParams = {
  openAIApiKey: apiKey,
}
const openAiConfiguration = {
  basePath: apiBase,
}
// workaround for azure
if (apiType === 'azure') {
  fixForAzure({ configuration: openAiConfiguration, axios, apiKey, apiVersion });
}

setupAxiosDebugging(axios);

const model = new OpenAI(openAiParams, openAiConfiguration);
const embeddings = new OpenAIEmbeddings(openAiParams, openAiConfiguration);

console.log("Loading docs...");
const docs = await loadAndProcessDocuments(targetDirectory, {
  // recursive: true,
  metadataText: 'application source code',
  embeddings,
})
const vectorStore = await vectorStoreFromDocuments(docs, { embeddings });
const vectorStoreToolName = 'code lookup';
const vectorStoreToolDescription = 'git repo source code';
const vectorStoreTool = new VectorStoreQATool(
  vectorStoreToolName,
  VectorStoreQATool.getDescription(vectorStoreToolName, vectorStoreToolDescription),
  {
    vectorStore,
    llm: model,
})

const tools = [
  new Calculator(),
  vectorStoreTool,
  new GitTool({ targetDirectory }),
];

const executor = await initializeAgentExecutorWithOptions(tools, model, {
  agentType: "zero-shot-react-description",
  verbose: true,
});

console.log("Loaded agent.");
console.log(`Executing with input "${question}"...`);
const result = await executor.call({ input: question });
console.log(`Got output ${result.output}`);
