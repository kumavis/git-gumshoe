import { config as loadEnvFile } from 'dotenv';
import axios from 'axios';
import { OpenAI } from "langchain/llms/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { Calculator } from "langchain/tools/calculator";
import { VectorStoreQATool } from "langchain/tools";
import { AgentExecutor, ZeroShotAgent, ZeroShotAgentOutputParser } from "langchain/agents";
import { setupAxiosDebugging } from './axios-debug.js';
import { fixForAzure } from './azure-fix.js';
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

// setupAxiosDebugging(axios);

const model = new OpenAI({ modelName: 'gpt-3.5-turbo', ...openAiParams }, openAiConfiguration);
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

// https://github.com/hwchase17/langchainjs/issues/920
class FixedOutputParser extends ZeroShotAgentOutputParser {
  async parse(text) {
    const result = await super.parse(text);
    // completed? return
    if (result.returnValues) {
      return result;
    }
    // fix parsing
    const match = /Action: (.*)\nAction Input: (.*)/s.exec(text);
    if (!match) {
      throw new Error(`Could not parse LLM output: ${text}`);
    }
    return {
      tool: match[1].trim(),
      toolInput: match[2].trim().replace(/\n/g, ""),
      log: text,
    };
  }
}

const executor = AgentExecutor.fromAgentAndTools({
  agent: ZeroShotAgent.fromLLMAndTools(model, tools, { outputParser: new FixedOutputParser() }),
  tools,
  returnIntermediateSteps: true,
  verbose: true,
});

console.log("Loaded agent.");
console.log(`Executing with input "${question}"...`);
const result = await executor.call({ input: question });
console.log(`Got output ${result.output}`);
