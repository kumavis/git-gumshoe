import { config as loadEnvFile } from 'dotenv';
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from 'langchain/prompts';
import { RetrievalQAChain, loadSummarizationChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

import { setupAxiosDebugging } from './axios-debug.js';
import { getAllCommits, gitShow } from './util.js';
import { iterate, parallelMapToQueue } from './gtor.js';
import { loadAndProcessDocuments, vectorStoreFromDocuments } from './documentProcessor.js';

loadEnvFile();
setupAxiosDebugging();

const [,,targetDir] = process.argv;
if (!targetDir) {
  throw new Error('Please provide a target directory as the first argument');
}

// StuffDocumentsChain
// MapReduceDocumentsChain
// RefineDocumentsChain
// loadSummarizationChain
// ConversationalRetrievalQAChain

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

// // Create a chain that uses the OpenAI LLM and HNSWLib vector store.
// const vectorStore = await vectorStoreFromDocuments(docs, { embeddings });
// const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

// console.log('call')
// const res = await chain.call({
//   query: "What is the general software architecture of this project?",
// });
// console.log({ res });

// const chain = loadSummarizationChain(model);
// const res = await chain.call({
//   input_documents: docs,
// });
// console.log({ res });
// console.log('docs', docs.length)

// async function main () {
//   // const [,,authorEmail] = process.argv
//   // if (!authorEmail) {
//   //   console.error('Please provide an author email as the first argument');
//   //   return;
//   // }
//   // const commits = await getCommitsByAuthor(authorEmail);
//   const commits = await getAllCommits();
//   console.log(`Analyzing ${commits.length} Commits:`);
  
//   // start queue of work
//   const resultQueue = parallelMapToQueue(20, iterate(commits), async (commit) => {
//     return await analyzeCommit(commit)
//   });

//   // log as results come in
//   const topResults = createTopResultsBucket(10, (result) => result.confidence)
//   for await (const result of resultQueue) {
//     const { commit, error, confidence, reasoning } = result;
//     const confidenceLabel = confidence != null ? `${confidence}` : '?';
//     console.log(`[${confidenceLabel}] ${commit.hash} (${commit.date}) - ${commit.message} `);
//     if (error) {
//       console.error(`  ${error.message}`);
//       continue;
//     }
//     if (confidence > 0) {
//       topResults.add(result);
//       console.log(`  ${reasoning}`);
//     }
//   }
//   console.log('\n\n');
//   console.log('Top Results:');
//   topResults.bucket.forEach(result => {
//     const { commit, confidence, reasoning } = result;
//     console.log(`[${confidence}] ${commit.hash} (${commit.date}) - ${commit.message} `);
//     console.log(`  ${reasoning}`);
//   });
// }

// async function analyzeCommit(commit) {
//   try {
//     const gitCommitDescription = await gitShow(commit.hash);
//     const result = await chain.call({ gitCommitDescription });
//     const reasoningText = readValueForLabel('Reasoning', result.text);
//     const confidenceText = readValueForLabel('Confidence', result.text);
//     const confidence = parsePercentText(confidenceText);
//     return {
//       commit,
//       response: result.text,
//       confidence,
//       reasoning: reasoningText,
//     };
//   } catch (error) {
//     // console.error('Error processing commit:', error);
//     return {
//       commit,
//       error,
//     }
//   }
// }

// function readValueForLabel (label, text) {
//   const labelIndex = text.indexOf(label);
//   if (labelIndex === -1) {
//     return null;
//   }
//   // +1 to skip the colon
//   const valueStartIndex = labelIndex + label.length + 1;
//   let valueEndIndex = text.indexOf('\n', valueStartIndex);
//   if (valueEndIndex === -1) {
//     valueEndIndex = text.length;
//   }
//   const value = text.slice(valueStartIndex, valueEndIndex);
//   const trimmedValue = value.trim();
//   return trimmedValue;
// }

// function parsePercentText (text) {
//   const percentIndex = text.indexOf('%');
//   if (percentIndex === -1) {
//     return null;
//   }
//   const valueEndIndex = percentIndex;
//   const value = text.slice(0, valueEndIndex);
//   const number = parseFloat(value, 10);
//   return number;
// }

// function createTopResultsBucket (limit, valueGetter) {
//   const bucket = [];
//   return {
//     add: (value) => {
//       const valueToCompare = valueGetter(value);
//       if (bucket.length < limit) {
//         bucket.push(value);
//         return;
//       }
//       // replace lowest value in bucket
//       let lowestValueIndex = 0;
//       let lowestValue = valueGetter(bucket[0]);
//       for (let i = 1; i < bucket.length; i++) {
//         const currentValue = valueGetter(bucket[i]);
//         if (currentValue < lowestValue) {
//           lowestValueIndex = i;
//           lowestValue = currentValue;
//         }
//       }
//       if (valueToCompare > lowestValue) {
//         bucket[lowestValueIndex] = value;
//       }
//     },
//     get: () => {
//       return bucket;
//     },
//   };
// }
  

// // main();