const fs = require('fs');
const path = require('path');

const servicesDir = __dirname;
const srcDir = path.join(servicesDir, '..');

const fileMoves = {
  'chat.service': 'chat/chat.service',
  'chatBranching.service': 'chat/chatBranching.service',
  'chatResponseHandler.service': 'chat/chatResponseHandler.service',
  'promptBuilder.service': 'chat/promptBuilder.service',
  'groupChat.service': 'chat/groupChat.service',
  'sharedChat.service': 'chat/sharedChat.service',
  'temporaryChat.service': 'chat/temporaryChat.service',
  'mcpClient.service': 'mcp/mcpClient.service',
  'mcpToolFilter.service': 'mcp/mcpToolFilter.service',
  'chatStreamRegistry.service': 'streams/chatStreamRegistry.service',
  'groupStreamRegistry.service': 'streams/groupStreamRegistry.service',
  'ai.service': 'ai/ai.service',
  'buildProjectContext': 'project/buildProjectContext',
  'project.service': 'project/project.service',
  'user.service': 'user/user.service',
  'memory.service': 'memory/memory.service',
  'cloudinary.service': 'storage/cloudinary.service'
};

function normalizeImportPath(fromFile, toFile) {
  let relativePath = path.relative(path.dirname(fromFile), toFile);
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  return relativePath.replace(/\\/g, '/').replace(/\.ts$/, '');
}

function walkSync(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filepath = path.join(dir, file);
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      walkSync(filepath, callback);
    } else if (stats.isFile() && filepath.endsWith('.ts')) {
      callback(filepath);
    }
  });
}

walkSync(servicesDir, (filepath) => {
  let content = fs.readFileSync(filepath, 'utf8');
  let changed = false;

  const importRegex = /(from\s+|import\s+)['"]([^'"]+)['"]/g;
  
  content = content.replace(importRegex, (match, prefix, importPath) => {
    if (!importPath.startsWith('.')) return match; // Skip npm modules
    
    // Calculate what the path WOULD have been before the move:
    // The current filepath is something like `src/services/chat/chat.service.ts`.
    // It used to be `src/services/chat.service.ts`.
    const oldFilePath = path.join(servicesDir, path.basename(filepath));
    const originallyResolvedPath = path.resolve(path.dirname(oldFilePath), importPath);
    
    // Now determine what the originally resolved path is in the new structure:
    let newResolvedPath = originallyResolvedPath;
    
    // If the original path was pointing to a file in services that moved:
    if (originallyResolvedPath.startsWith(servicesDir)) {
      const relToServices = path.relative(servicesDir, originallyResolvedPath);
      let matchedKey = null;
      for (const key of Object.keys(fileMoves)) {
        if (relToServices === key || relToServices === key + '.ts') {
          matchedKey = key;
          break;
        }
      }
      if (matchedKey) {
        newResolvedPath = path.join(servicesDir, fileMoves[matchedKey]);
      }
    }
    
    const newImportPath = normalizeImportPath(filepath, newResolvedPath);
    if (newImportPath !== importPath) {
      changed = true;
      return `${prefix}"${newImportPath}"`;
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`Fixed imports in ${filepath}`);
  }
});
