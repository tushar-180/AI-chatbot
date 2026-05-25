const { spawnSync } = require('child_process');
const fs = require('fs');

const packages = [
  '@clerk/express',
  '@google/genai',
  '@langchain/textsplitters',
  '@modelcontextprotocol/sdk',
  '@supabase/supabase-js',
  '@tavily/core',
  '@upstash/redis',
  'cloudinary',
  'compromise',
  'cors',
  'csv-parse',
  'date-fns',
  'dotenv',
  'eventsource',
  'express',
  'file-type',
  'langchain',
  'mammoth',
  'minisearch',
  'mongoose',
  'morgan',
  'multer',
  'office-text-extractor',
  'officeparser',
  'openai',
  'pdf-lib',
  'pdf-parse',
  'pptx2json',
  'read-excel-file',
  'socket.io',
  'tldts',
  'youtube-transcript'
];

console.log('Starting Subprocess Import Diagnostic...');

for (const pkg of packages) {
  const result = spawnSync('node', ['-e', `require('${pkg}')`], { stdio: 'pipe' });
  if (result.status === 0) {
    console.log(`✅ Success: ${pkg}`);
  } else {
    const signal = result.signal ? ` (Signal: ${result.signal})` : '';
    const code = result.status !== null ? ` (Exit code: ${result.status})` : '';
    const errText = result.stderr ? result.stderr.toString().trim() : '';
    console.log(`❌ FAILED: ${pkg}${code}${signal}`);
    if (errText) console.log(`   Error output: ${errText}`);
  }
}
