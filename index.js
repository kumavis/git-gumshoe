import { config } from 'dotenv';
import { LLMChain } from 'langchain/chains';
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from 'langchain/prompts';
import { getAllCommits, getCommitsByAuthor, gitShow } from './util.js';
import { iterate, parallelMapToQueue } from './gtor.js';

config();

const template = `
\`\`\`
{gitCommitDescription}
\`\`\`

Does this code commit look suspicious? Could it have inserted a means of stealing a private key? (Bad entropy for key generation, sending key to server, etc)

Respond in the following format. Confidence should be a percent between 0-100% representing the likeliness that it introduced a means of key compromise based on the information available. Reasoning should explain the number.
Confidence: [percent number here]
Reasoning: [reasoning for your determination here]
`
const prompt = new PromptTemplate({
  template: template,
  inputVariables: ['gitCommitDescription'],
});
const model = new OpenAI({  });
const chain = new LLMChain({ llm: model, prompt });



async function main () {
  // const [,,authorEmail] = process.argv
  // if (!authorEmail) {
  //   console.error('Please provide an author email as the first argument');
  //   return;
  // }
  // const commits = await getCommitsByAuthor(authorEmail);
  const commits = await getAllCommits();
  console.log(`Analyzing ${commits.length} Commits:`);
  
  // start queue of work
  const resultQueue = parallelMapToQueue(20, iterate(commits), async (commit) => {
    return await analyzeCommit(commit)
  });

  // log as results come in
  const topResults = createTopResultsBucket(10, (result) => result.confidence)
  for await (const result of resultQueue) {
    const { commit, error, confidence, reasoning } = result;
    const confidenceLabel = confidence != null ? `${confidence}` : '?';
    console.log(`[${confidenceLabel}] ${commit.hash} (${commit.date}) - ${commit.message} `);
    if (error) {
      console.error(`  ${error.message}`);
      continue;
    }
    if (confidence > 0) {
      topResults.add(result);
      console.log(`  ${reasoning}`);
    }
  }
  console.log('\n\n');
  console.log('Top Results:');
  topResults.bucket.forEach(result => {
    const { commit, confidence, reasoning } = result;
    console.log(`[${confidence}] ${commit.hash} (${commit.date}) - ${commit.message} `);
    console.log(`  ${reasoning}`);
  });
}

async function analyzeCommit(commit) {
  try {
    const gitCommitDescription = await gitShow(commit.hash);
    const result = await chain.call({ gitCommitDescription });
    const reasoningText = readValueForLabel('Reasoning', result.text);
    const confidenceText = readValueForLabel('Confidence', result.text);
    const confidence = parsePercentText(confidenceText);
    return {
      commit,
      response: result.text,
      confidence,
      reasoning: reasoningText,
    };
  } catch (error) {
    // console.error('Error processing commit:', error);
    return {
      commit,
      error,
    }
  }
}

function readValueForLabel (label, text) {
  const labelIndex = text.indexOf(label);
  if (labelIndex === -1) {
    return null;
  }
  // +1 to skip the colon
  const valueStartIndex = labelIndex + label.length + 1;
  let valueEndIndex = text.indexOf('\n', valueStartIndex);
  if (valueEndIndex === -1) {
    valueEndIndex = text.length;
  }
  const value = text.slice(valueStartIndex, valueEndIndex);
  const trimmedValue = value.trim();
  return trimmedValue;
}

function parsePercentText (text) {
  const percentIndex = text.indexOf('%');
  if (percentIndex === -1) {
    return null;
  }
  const valueEndIndex = percentIndex;
  const value = text.slice(0, valueEndIndex);
  const number = parseFloat(value, 10);
  return number;
}

function createTopResultsBucket (limit, valueGetter) {
  const bucket = [];
  return {
    add: (value) => {
      const valueToCompare = valueGetter(value);
      if (bucket.length < limit) {
        bucket.push(value);
        return;
      }
      // replace lowest value in bucket
      let lowestValueIndex = 0;
      let lowestValue = valueGetter(bucket[0]);
      for (let i = 1; i < bucket.length; i++) {
        const currentValue = valueGetter(bucket[i]);
        if (currentValue < lowestValue) {
          lowestValueIndex = i;
          lowestValue = currentValue;
        }
      }
      if (valueToCompare > lowestValue) {
        bucket[lowestValueIndex] = value;
      }
    },
    get: () => {
      return bucket;
    },
  };
}
  

main();