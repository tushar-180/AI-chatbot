const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

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

function normalizeImportPath(fromFile, toFile) {
  let relativePath = path.relative(path.dirname(fromFile), toFile);
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  return relativePath.replace(/\\/g, '/').replace(/\.ts$/, '');
}

walkSync(srcDir, (filepath) => {
  let content = fs.readFileSync(filepath, 'utf8');
  let changed = false;

  // We are looking for imports like: import ... from ".../services/X"
  // or relative imports within services: import ... from "./X" or "../services/X"
  
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  
  content = content.replace(importRegex, (match, importPath) => {
    // Check if the import resolves to something in the services directory
    let resolvedImportPath;
    if (importPath.startsWith('.')) {
      resolvedImportPath = path.resolve(path.dirname(filepath), importPath);
    } else {
      return match; // External module, skip
    }

    const servicesDir = path.join(srcDir, 'services');
    
    // Check if the imported file is inside services directory
    if (resolvedImportPath.startsWith(servicesDir)) {
      let relativeToServices = path.relative(servicesDir, resolvedImportPath);
      // It might not have the extension
      
      let matchedKey = null;
      for (const key of Object.keys(fileMoves)) {
        if (relativeToServices === key || relativeToServices === key + '.ts') {
          matchedKey = key;
          break;
        }
      }

      if (matchedKey) {
        // The file was moved!
        const newResolvedPath = path.join(servicesDir, fileMoves[matchedKey]);
        const newImportPath = normalizeImportPath(filepath, newResolvedPath);
        changed = true;
        return `from "${newImportPath}"`;
      }
    }
    
    return match;
  });

  if (changed) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`Updated imports in ${filepath}`);
  }
});
