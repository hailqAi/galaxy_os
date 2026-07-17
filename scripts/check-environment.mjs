const major = Number(process.versions.node.split('.')[0]);

if (major < 20) {
  console.error(`Node.js 20+ is required; found ${process.version}.`);
  process.exit(1);
}

console.log(`Environment OK: Node ${process.version}, ${process.platform}.`);
