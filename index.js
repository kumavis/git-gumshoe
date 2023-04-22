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
    await ask({ model, embeddings, commandArgs, verbose: true });
    break;
  case 'askMany':
    await askMany({ count: 10, embeddings, commandArgs });
    break;
  case 'testTemperature':
    // top-p: 0-1?
    await testTemperature({ count: 10, maxTemp: 2, rounds: 50, embeddings, commandArgs });
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

async function testTemperature({ count = 3, rounds = 5, minTemp = 0, maxTemp = 1, embeddings, vectorStore: _vectorStore, commandArgs, log = console.log }) {
  const [_targetDirectory, _question, answer] = commandArgs;
  if (!answer) {
    throw new Error('Please provide a correct answer for the assessment');
  }
  const vectorStore = _vectorStore ?? await HNSWLib.load(
    './.vectorstore',
    embeddings
  );
  const agentScores = Array(count).fill(0);
  // each round
  await Promise.all(Array(rounds).fill().map(async () => {
    // each agent session
    const results = await askMany({ count, minTemp, maxTemp, embeddings, vectorStore, commandArgs, log });
    results.forEach((result, index) => {
      const { output } = result;
      const correct = output && output.includes(answer);
      if (correct) {
        agentScores[index]++;
      }
    })
  }))
  agentScores.forEach((score, index) => {
    const tempLabel = minTemp + (maxTemp - minTemp) * (index / (count - 1)).toFixed(1);
    log(`[${index}] (${tempLabel}): ${score}/${rounds}`);
  })
}

async function askMany({ count = 3, minTemp = 0, maxTemp = 1, embeddings, vectorStore: _vectorStore, commandArgs, log = console.log }) {
  const vectorStore = _vectorStore ?? await HNSWLib.load(
    './.vectorstore',
    embeddings
  );
  const modelParams = { modelName: 'gpt-3.5-turbo', ...openAiParams };
  const agentParams = Array(count).fill().map((_, index) => {
    const temperature = minTemp + (maxTemp - minTemp) * (index / (count - 1));
    return { temperature };
  });
  const models = agentParams.map(params => new OpenAI({ ...params, ...modelParams }, openAiConfiguration));
  const results = await Promise.all(models.map((model, index) => {
    const log = (...args) => console.log(`[${index}]:`, ...args);
    return ask({ model, log, embeddings, vectorStore, commandArgs }).catch(error => ({ error }));
  }));
  results.forEach((result, index) => {
    const agentParam = agentParams[index];
    const tempLabel = agentParam.temperature.toFixed(1);
    const { output, error } = result;
    const maxResultSize = 200;
    const resultLabel = error ? `(error: ${error.message})` : output.length > maxResultSize ? `${output.slice(0, maxResultSize)} [...]` : output;
    console.log(`[${index}] (${tempLabel}): ${resultLabel}`);
  });
  return results;
}

async function ask({ model, embeddings, commandArgs, vectorStore: _vectorStore, log = console.log, verbose = false }) {
  const [targetDirectory, question] = commandArgs;
  if (!targetDirectory) {
    throw new Error('Please provide a target directory as the first argument');
  }
  if (!question) {
    throw new Error('Please provide a question as the second argument');
  }
  
  // log("Loading vector store...");
  const vectorStore = _vectorStore ?? await HNSWLib.load(
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
    verbose,
  });

  log(`Loaded agent. Executing with input "${question}"...`);
  const result = await executor.call({ input: question });

  return result;
}