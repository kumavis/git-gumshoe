import { config as loadEnvFile } from 'dotenv';
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from 'langchain/prompts';
import { RetrievalQAChain, loadSummarizationChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
// import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { VectorStoreQATool } from "langchain/tools";
import { setupAxiosDebugging } from './axios-debug.js';
import { getAllCommits, gitShow } from './util.js';
import { iterate, parallelMapToQueue } from './gtor.js';
import { loadAndProcessDocuments, vectorStoreFromDocuments } from './documentProcessor.js';

loadEnvFile();
// setupAxiosDebugging();

const [,,targetDir] = process.argv;
if (!targetDir) {
  throw new Error('Please provide a target directory as the first argument');
}

const openAiParams = {
  modelName: process.env.OPENAI_API_MODEL,
  openAIApiKey: process.env.OPENAI_API_KEY,
}
const openAiConfiguration = {
  basePath: process.env.OPENAI_API_BASE,
  baseOptions: {},
}

// workaround for azure
if (process.env.OPENAI_API_TYPE === 'azure') {
  const baseOptions = openAiConfiguration.baseOptions ?? {}
  openAiConfiguration.baseOptions = {
    ...baseOptions,
    headers: {
      ...baseOptions.headers ?? {},
      'api-key': process.env.OPENAI_API_KEY,
    },
    params: {
      ...baseOptions.params ?? {},
      'api-version': process.env.OPENAI_API_VERSION,
    }
  }
}

const model = new OpenAI(openAiParams, openAiConfiguration);
const embeddings = new OpenAIEmbeddings(openAiParams, openAiConfiguration);

const docs = await loadAndProcessDocuments(targetDir, {
  // recursive: true,
  metadataText: 'application source code',
  embeddings,
})
const vectorStore = await vectorStoreFromDocuments(docs, { embeddings });
const vectorStoreToolName = 'knowledge base';
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
];

const executor = await initializeAgentExecutorWithOptions(tools, model, {
  agentType: "zero-shot-react-description",
  verbose: true,
});
console.log("Loaded agent.");

const input = `What views display account balances?`;

console.log(`Executing with input "${input}"...`);

const result = await executor.call({ input });

console.log(`Got output ${result.output}`);
