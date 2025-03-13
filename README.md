# Claude Chat Context MCP Server

A Model Context Protocol (MCP) server for Claude Desktop that maintains chat context across sessions. The server keeps track of past conversations and allows Claude to reference them in future interactions.

## Features

- **Persistent Context Storage**: Saves chat history to disk so Claude can remember past conversations.
- **Multiple Conversations**: Support for maintaining separate conversation threads.
- **Search Functionality**: Search across past conversations by content.
- **Memory Management**: Automatically manages conversation size limits to prevent context overflow.
- **Simple Integration**: Works seamlessly with Claude Desktop.

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Claude Desktop

### Installation Steps

1. Clone this repository or download the source code:
   ```bash
   git clone https://github.com/yourusername/claude-chat-context-mcp.git
   cd claude-chat-context-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Install globally (optional):
   ```bash
   npm install -g .
   ```

## Configuration

### Claude Desktop Configuration

1. Locate your Claude Desktop configuration file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add the MCP server configuration:

```json
{
  "mcpServers": {
    "chat-context": {
      "command": "npx",
      "args": ["-y", "claude-chat-context-mcp"],
      "env": {
        "CHAT_CONTEXT_ROOT": "/path/to/context/storage",
        "MAX_CONVERSATION_SIZE": "50000",
        "MAX_HISTORY_ENTRIES": "10"
      }
    }
  }
}
```

Or, if you installed the server globally:

```json
{
  "mcpServers": {
    "chat-context": {
      "command": "claude-chat-context-mcp",
      "env": {
        "CHAT_CONTEXT_ROOT": "/path/to/context/storage",
        "MAX_CONVERSATION_SIZE": "50000",
        "MAX_HISTORY_ENTRIES": "10"
      }
    }
  }
}
```

### Configuration Options

- `CHAT_CONTEXT_ROOT`: Directory where conversation data will be stored (default: `~/.claude/context`)
- `MAX_CONVERSATION_SIZE`: Maximum character size for a conversation (default: 50000)
- `MAX_HISTORY_ENTRIES`: Maximum number of conversations to keep in history (default: 10)

## Usage with Claude

Once configured, Claude can use the following MCP tools:

- `create_conversation`: Start a new conversation
- `get_conversation`: Retrieve a past conversation
- `append_message`: Add a message to a conversation
- `list_conversations`: List recent conversations
- `search_conversations`: Search for conversations by content
- `delete_conversation`: Remove a conversation

Example system prompt for Claude:

```
You are an assistant with persistent memory through the chat-context MCP server.

At the beginning of our conversation:
1. Use list_conversations to retrieve recent conversations
2. If there are related conversations, use get_conversation to load them
3. Reference relevant information from past conversations when appropriate

When ending a conversation:
1. Append the current conversation to the chat history
2. Create a brief summary of the key points discussed
```

## Development

### Project Structure

```
claude-chat-context-mcp/
├── src/                 # Source code
│   └── index.ts         # Main server implementation
├── dist/                # Compiled JavaScript
├── package.json         # Project dependencies
├── tsconfig.json        # TypeScript configuration
└── README.md            # Documentation
```

### Commands

- `npm run build` - Compile TypeScript code
- `npm run dev` - Watch for changes and rebuild
- `npm start` - Run the compiled server

## Troubleshooting

### Common Issues

1. **Claude can't access the server**
   - Ensure the configuration path is correct
   - Check that npx is accessible in your environment
   - Verify file permissions for the context storage directory

2. **Error: "EACCES: permission denied"**
   - The server lacks permissions to write to the context directory
   - Solution: Change the CHAT_CONTEXT_ROOT to a directory where you have write permissions

3. **Claude doesn't remember past conversations**
   - Ensure you're providing proper prompting to Claude to use the context tools
   - Check that conversations are being stored correctly by examining the context directory

## License

MIT
