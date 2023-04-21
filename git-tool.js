import { spawn } from 'node:child_process';
import { DynamicTool } from 'langchain/tools';

const defaultAllowedCommands = [
  'log',
  'show-ref'
]

export class GitTool extends DynamicTool {
  constructor(fields = {}) {
    super({
      name: fields.name ?? 'git',
      description: fields.description ?? 'Run git commands',
    });
    this.func = fields.func ?? this._func.bind(this);
    this.targetDirectory = fields.targetDirectory;
    if (!this.targetDirectory) {
      throw new Error('GitTool - targetDirectory is required');
    }
    this.allowedCommands = fields.allowedCommands ?? defaultAllowedCommands;
    this.maxOutputLength = fields.maxOutputLength ?? 1024;
  }

  async _func (input) {
    const maxOutputLength = this.maxOutputLength;
    const startIndex = input.indexOf('git')
    if (startIndex === -1) {
      // throw new Error('No git command found');
      return `Error: "${input}" is not a valid git command`;
    }
    console.log(`git command input: "${input}"`)
    const args = input.slice(startIndex + 3).trim().split(' ');
    let stdout, stderr, didTruncate;
    try {
      ({ stdout, stderr, didTruncate } = await runGit(args, this.allowedCommands, this.targetDirectory, maxOutputLength));
    } catch (err) {
      console.error('Error running git command:', err, stderr);
      return `Error: ${err.message}\n${stderr}`;
    }
    if (didTruncate) {
      const truncationMessage = `\n(Output was truncated because it was too long)`;
      const oversize = (stdout.length + truncationMessage.length) - maxOutputLength;
      // console.error(`Output was truncated: ${stdout.length} > ${maxOutputLength}, removing an additional ${oversize} for truncation message`);
      if (oversize > 0) {
        return stdout.slice(0, -oversize) + truncationMessage;
      }
      return truncationMessage;
    }
    return stdout;
  }
  
}

async function runGit(args, allowedCommands, targetDirectory, maxOutputLength) {
  console.log('running git', args);
  const [command] = args;
  if (!allowedCommands.includes(command)) {
    throw new Error(`Command ${command} is not allowed`);
  }

  return trackProcessUntilBufferIsFull(
    spawn('git', args, { cwd: targetDirectory }),
    maxOutputLength
  );
}

function trackProcessUntilBufferIsFull(childProcess, maxOutputLength = Infinity) {
  let stdout = '';
  let stderr = '';
  return new Promise((resolve, reject) => {
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > maxOutputLength) {
        childProcess.kill(); // Kill the process when the max output length is reached
        stdout = stdout.slice(0, maxOutputLength); // Trim the output to the max output length
        resolve({ stdout, stderr, didTruncate: true });
      }
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('error', (error) => {
      reject(error);
    });

    childProcess.on('close', (code) => {
      if (code === null) {
        // ignore, this is the kill command from above
        return;
      }
      if (code !== 0) {
        console.error(`Git process exited with code ${code}`);
        reject(new Error(`Git process exited with code ${code}`));
      } else {
        resolve({ stdout, stderr, didTruncate: false });
      }
    });
  });
}