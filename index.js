import { config as loadEnvFile } from 'dotenv';
import axios from 'axios';
import { OpenAI } from "langchain/llms/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { Calculator } from "langchain/tools/calculator";
import { VectorStoreQATool } from "langchain/tools";
import { AgentExecutor, ZeroShotAgent } from "langchain/agents";
import { setupAxiosDebugging } from './axios-debug.js';
import { fixForAzure } from './azure-fix.js';
import { loadAndProcessDocuments, vectorStoreFromDocuments } from './documentProcessor.js';
import { GitTool } from './git-tool.js';
import { ZeroShotAgentOutputParser } from './src/ZeroShotAgentOutputParser.js';

// parse command arguments
const [,, ...cliArgs] = process.argv;
const [command, ...commandArgs] = cliArgs;

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

// setupAxiosDebugging(axios, true);

const embeddings = new OpenAIEmbeddings(openAiParams, openAiConfiguration);

switch (command) {
  case 'ask':
    const model = new OpenAI({ modelName: 'gpt-3.5-turbo', ...openAiParams }, openAiConfiguration);
    await ask({ model, embeddings, commandArgs });
    break;
  case 'ask3':
    await askThree({ embeddings, commandArgs });
    break;
  case 'index':
    await index({ embeddings, commandArgs });
    break;
  default:
    throw new Error(`Unknown command ${command}`);
}

async function index({ embeddings, commandArgs, log = console.log }) {
  const [targetDirectory] = commandArgs;
  if (!targetDirectory) {
    throw new Error('Please provide a target directory as the first argument');
  }

  log("Loading docs...");
  const docs = await loadAndProcessDocuments(targetDirectory, {
    // recursive: true,
    metadataText: 'application source code',
    embeddings,
  })
  const vectorStore = await vectorStoreFromDocuments(docs, { embeddings });
  await vectorStore.save('./.vectorstore');
}

async function askThree({ embeddings, commandArgs, log = console.log }) {
  const modelParams = { modelName: 'gpt-3.5-turbo', ...openAiParams };
  const model1 = new OpenAI({ temperature: 0, ...modelParams }, openAiConfiguration);
  const model2 = new OpenAI({ temperature: 0.5, ...modelParams }, openAiConfiguration);
  const model3 = new OpenAI({ temperature: 1, ...modelParams }, openAiConfiguration);
  const log1 = (...args) => log(`[1]:`, ...args);
  const log2 = (...args) => log(`[2]:`, ...args);
  const log3 = (...args) => log(`[3]:`, ...args);
  await Promise.all([
    ask({ model: model1, log: log1, embeddings, commandArgs }),
    ask({ model: model2, log: log2, embeddings, commandArgs }),
    ask({ model: model3, log: log3, embeddings, commandArgs }),
  ]);
}

async function ask({ model, embeddings, commandArgs, log = console.log }) {
  const [targetDirectory, question] = commandArgs;
  if (!targetDirectory) {
    throw new Error('Please provide a target directory as the first argument');
  }
  if (!question) {
    throw new Error('Please provide a question as the second argument');
  }
  
  log("Loading vector store...");
  const vectorStore = await HNSWLib.load(
    './.vectorstore',
    embeddings
  );

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

  const executor = AgentExecutor.fromAgentAndTools({
    agent: ZeroShotAgent.fromLLMAndTools(model, tools, { outputParser: new ZeroShotAgentOutputParser() }),
    tools,
    returnIntermediateSteps: true,
    verbose: true,
  });

  log("Loaded agent.");
  log(`Executing with input "${question}"...`);
  const result = await executor.call({ input: question });
  log(`Got output ${result.output}`);
  return result;
}