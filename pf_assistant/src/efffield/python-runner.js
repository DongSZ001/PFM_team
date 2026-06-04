'use strict';

const fs = require('fs');
const { spawn } = require('child_process');

function getDefaultPythonBin() {
  const preferred = '/home/admin/.miniconda3/envs/pfm-env/bin/python3.11';
  if (fs.existsSync(preferred)) return preferred;
  return 'python3';
}

function runPythonCommand({ pythonBin = process.env.EFFFIELD_PYTHON || getDefaultPythonBin(), args, cwd, env = {}, timeoutMs = 15 * 60 * 1000 }) {
  if (!Array.isArray(args) || args.length === 0) throw new Error('args is required');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('efffield command timed out'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

module.exports = { runPythonCommand };
