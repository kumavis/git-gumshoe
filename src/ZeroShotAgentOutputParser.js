import { ZeroShotAgentOutputParser } from "langchain/agents";

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

export { FixedOutputParser as ZeroShotAgentOutputParser }