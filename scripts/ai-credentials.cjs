'use strict';

// Chỉ loader backend/CLI dùng định dạng KEY=JSON_STRING; không source bằng shell.
const fs = require('node:fs');
const names = [
  'GEMINI_API_KEY',
  'MISTRAL_API_KEY',
  'KIRA_API_KEY',
  'OPENROUTER_API_KEY',
  'LLAMA_CLOUD_API_KEY',
  'TAVILY_API_KEY',
  'OPENAI_API_KEY',
];
function readCredentials(source) {
  if (
    !source ||
    source.mode !== 'env' ||
    typeof source.path !== 'string' ||
    !source.path.startsWith('/')
  )
    return { keys: {}, status: 'INVALID_CREDENTIAL_SOURCE' };
  let fd;
  try {
    fd = fs.openSync(
      source.path,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size > 32768 ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077
    )
      return { keys: {}, status: 'SECRET_FILE_UNREADABLE' };
    const keys = {};
    for (const line of fs.readFileSync(fd, 'utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      const name = line.slice(0, index);
      if (index < 0 || !names.includes(name) || Object.hasOwn(keys, name))
        throw new Error();
      const value = JSON.parse(line.slice(index + 1));
      if (
        typeof value !== 'string' ||
        !value ||
        value.length > 4096 ||
        /[\s\x00-\x1f\x7f]/u.test(value)
      )
        throw new Error();
      keys[name] = value;
    }
    return { keys, status: 'LOADED' };
  } catch (error) {
    return {
      keys: {},
      status:
        error.code === 'ENOENT' ? 'SECRET_FILE_MISSING' : 'SECRET_FILE_INVALID',
    };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
module.exports = { readCredentials };
// Private pipe protocol to Python, never invoke this command with a real key in argv.
if (require.main === module) {
  try {
    const source = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(readCredentials(source)));
  } catch {
    process.stdout.write(
      JSON.stringify({ keys: {}, status: 'INVALID_CREDENTIAL_SOURCE' }),
    );
    process.exitCode = 1;
  }
}
