import { spawn } from 'node:child_process';
import { DynamicTool } from 'langchain/tools';

const defaultDescription = 'Run a single git command. This is NOT a full shell and you CANNOT run other commands or use a pipe. Example: git log';

const defaultAllowedCommands = [
  'log',
  'shortlog',
  'show-ref',
  'status',
  'grep',
]

export class GitTool extends DynamicTool {
  constructor(fields = {}) {
    super({
      name: fields.name ?? 'git',
      description: fields.description ?? defaultDescription,
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
    const [command] = input.trim().split(' ')
    if (command !== 'git') {
      return `Error: Must only run a git command, no other terminal commands are allowed. Example: git log`;
    }
    console.log(`git command input: "${input}"`)
    const commandArgString = input.slice(command.length + 1).trim();
    const args = parseCommandArgs(commandArgString);
    if (args.includes('|')) {
      return `Error: Cannot pipe commands`;
    }
    let stdout, stderr, didTruncate;
    try {
      ({ stdout, stderr, didTruncate } = await runGit(args, this.allowedCommands, this.targetDirectory, maxOutputLength));
    } catch (err) {
      // console.error('Error running git command:', err, stderr);
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

function parseCommandArgs(commandString) {
  const regex = /(?:[^\s"']+|'[^']*'|"[^"]*")+/g;
  const args = [];
  let match;

  while ((match = regex.exec(commandString)) !== null) {
    args.push(match[0]);
  }

  return args;
}


async function runGit(args, allowedCommands, targetDirectory, maxOutputLength) {
  console.log('running git', args);
  const command = args.find((arg) => !arg.startsWith('-'));
  if (!allowedCommands.includes(command)) {
    throw new Error(`Command "${command}" is not allowed`);
  }

  return trackProcessUntilBufferIsFull(
    spawn('git', args, {
      cwd: targetDirectory,
      // ignore stdin, pipe stdout and stderr
      // this prevents run commands from expecting interactive input
      stdio: ["ignore", "pipe", "pipe"],
    }),
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