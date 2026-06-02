import { userService } from "../user/user.service";
import { mcpClientService } from "./mcpClient.service";

export const getEnabledMcpTools = async (userId: string, hasFiles: boolean = true, latestMessageText: string = "", attachedFileNames: string[] = []) => {
  const user = await userService.getUserByClerkId(userId);
  const disabledMcpServers = (user?.get("disabledMcpServers") || []) as string[];
  const allTools = await mcpClientService.getActiveTools();

  const lowerMessage = latestMessageText.toLowerCase();

  // 1. Dynamic keywords from active tools (Future-proofing for new MCPs)
  // Extracts words like 'spotify' from 'spotify-mcp-server' or 'create_playlist'
  const dynamicKeywords = new Set<string>();
  allTools.forEach(tool => {
      const sNameParts = (tool._serverName || "").toLowerCase().split(/[-_]/);
      const tNameParts = (tool.name || "").toLowerCase().split(/[-_]/);
      [...sNameParts, ...tNameParts].forEach(part => {
          if (part.length > 3 && !['server', 'mcp', 'tool', 'api'].includes(part)) {
              dynamicKeywords.add(part);
          }
      });
  });

  const hasDynamicIntent = Array.from(dynamicKeywords).some(kw => lowerMessage.includes(kw));
  
  // 2. Categorized intent keywords
  const categories = {
    weather: ['weather', 'forecast', 'temperature', 'rain', 'climate', 'sun', 'cloud', 'humidity', 'wind'],
    github: ['github', 'git', 'repo', 'pr', 'commit', 'issue', 'pull request', 'repository'],
    database: ['db', 'database', 'query', 'sql', 'mysql', 'postgres', 'sqlite', 'table', 'record', 'row'],
    web: ['search', 'web', 'google', 'find', 'lookup', 'browse', 'research', 'current', 'latest', 'today', 'now'],
    memory: ['remember', 'memory', 'forget', 'recall'],
    general: [
      'mcp',
      'tool',
      'run',
      'execute',
      'fetch',
      'use the tool',
      'use tools',
      'check',
      'verify',
      'inspect',
      'analyze',
      'compare',
      'details',
      'information',
      'info',
      'status',
      'read',
      'open',
      'list',
      'show me',
      'give me',
      'look up',
      'retrieve',
    ]
  };

  const triggeredCategories = new Set<string>();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      triggeredCategories.add(category);
    }
  }

  const hasToolIntent = triggeredCategories.size > 0 || hasDynamicIntent;

  // If no files are attached AND no tool keywords are present, pass ZERO tools
  if (!hasFiles && !hasToolIntent) {
    return [];
  }

  return allTools.filter((tool) => {
    if (disabledMcpServers.includes(tool._serverName)) return false;

    const toolName = tool.name.toLowerCase();
    const serverName = (tool._serverName || "").toLowerCase();

    const isExcelOrCsvTool = 
        toolName.includes("excel") || serverName.includes("excel") ||
        toolName.includes("csv") || serverName.includes("csv");

    if (isExcelOrCsvTool && attachedFileNames.length > 0) {
        const hasExcelOrCsvFile = attachedFileNames.some(f => {
            const lower = (f || "").toLowerCase();
            return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
        });
        if (!hasExcelOrCsvFile) {
            return false;
        }
    }
    
    const isFileTool = 
        toolName.includes("excel") || serverName.includes("excel") ||
        toolName.includes("csv") || serverName.includes("csv") ||
        toolName.includes("pdf") || serverName.includes("pdf") ||
        toolName.includes("file") || serverName.includes("file") ||
        toolName.includes("document") || serverName.includes("document");

    if (hasFiles && !hasToolIntent) return isFileTool;
    if (!hasFiles && isFileTool) return false;

    // If 'general' keywords used, allow all non-file tools
    if (triggeredCategories.has('general')) return true;

    // Check if THIS tool has a dynamic match
    const sNameParts = serverName.split(/[-_]/);
    const tNameParts = toolName.split(/[-_]/);
    const thisToolHasDynamicMatch = [...sNameParts, ...tNameParts].some(part => 
      part.length > 3 && !['server', 'mcp', 'tool', 'api'].includes(part) && lowerMessage.includes(part)
    );

    if (thisToolHasDynamicMatch) return true;

    // Categorize the tool itself
    let toolCategory = "other";
    if (toolName.includes("weather") || serverName.includes("weather") || toolName.includes("forecast")) toolCategory = "weather";
    else if (toolName.includes("github") || serverName.includes("github") || toolName.includes("git")) toolCategory = "github";
    else if (toolName.includes("sql") || serverName.includes("sql") || toolName.includes("db") || serverName.includes("postgres") || serverName.includes("mysql") || serverName.includes("sqlite")) toolCategory = "database";
    else if (toolName.includes("search") || serverName.includes("search") || toolName.includes("web") || toolName.includes("google") || toolName.includes("tavily") || serverName.includes("brave")) toolCategory = "web";
    else if (toolName.includes("memory") || serverName.includes("memory")) toolCategory = "memory";

    // If the tool is categorized but its category wasn't triggered, EXCLUDE IT
    if (toolCategory !== "other" && !triggeredCategories.has(toolCategory)) {
        return false;
    }

    return true;
  });
};
