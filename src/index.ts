#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  ServerResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs-extra";
import { join } from "path";
import os from "os";

// Configure default paths and settings
const DEFAULT_CONFIG = {
  rootPath: process.env.CHAT_CONTEXT_ROOT || join(os.homedir(), ".claude", "context"),
  maxConversationSize: parseInt(process.env.MAX_CONVERSATION_SIZE || "50000", 10),
  maxHistoryEntries: parseInt(process.env.MAX_HISTORY_ENTRIES || "10", 10)
};

// Define the structure for conversation metadata
interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  size: number;
}

// Define the structure for a conversation
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// Define the structure for a message in a conversation
interface Message {
  id: string;
  role: "human" | "assistant";
  content: string;
  timestamp: string;
}

class ContextManager {
  private rootPath: string;
  private conversationsPath: string;
  private maxConversationSize: number;

  constructor(config: typeof DEFAULT_CONFIG) {
    this.rootPath = config.rootPath;
    this.conversationsPath = join(this.rootPath, "conversations");
    this.maxConversationSize = config.maxConversationSize;
    this.initialize();
  }

  // Initialize the directory structure
  private initialize(): void {
    try {
      fs.ensureDirSync(this.rootPath);
      fs.ensureDirSync(this.conversationsPath);
      console.error(`Context storage initialized at ${this.rootPath}`);
    } catch (error) {
      console.error("Failed to initialize context storage:", error);
      throw error;
    }
  }

  // Generate a unique ID for conversations and messages
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  // Create a new conversation
  async createConversation(title: string): Promise<ConversationMeta> {
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    
    const conversation: Conversation = {
      id,
      title,
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const filePath = join(this.conversationsPath, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));

    return {
      id,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      messageCount: 0,
      size: 0
    };
  }

  // Get a conversation by ID
  async getConversation(id: string): Promise<Conversation> {
    this.validateId(id);
    
    const filePath = join(this.conversationsPath, `${id}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as Conversation;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Conversation with ID ${id} not found`);
      }
      throw error;
    }
  }

  // Delete a conversation
  async deleteConversation(id: string): Promise<void> {
    this.validateId(id);
    
    const filePath = join(this.conversationsPath, `${id}.json`);
    
    try {
      await fs.remove(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Conversation with ID ${id} not found`);
      }
      throw error;
    }
  }

  // Append a message to a conversation
  async appendMessage(conversationId: string, role: "human" | "assistant", content: string): Promise<Message> {
    this.validateId(conversationId);
    
    const conversation = await this.getConversation(conversationId);
    
    // Check if adding this message would exceed the size limit
    const messageSize = content.length;
    const currentSize = conversation.messages.reduce((size, msg) => size + msg.content.length, 0);
    
    if (currentSize + messageSize > this.maxConversationSize) {
      // Remove oldest messages until we have enough space
      while (conversation.messages.length > 0 && 
             currentSize + messageSize - conversation.messages[0].content.length > this.maxConversationSize) {
        const removed = conversation.messages.shift();
        if (removed) {
          console.error(`Removed oldest message (${removed.id}) to make space`);
        }
      }
      
      // If we still don't have enough space, throw an error
      if (messageSize > this.maxConversationSize) {
        throw new Error(`Message size (${messageSize}) exceeds maximum allowed size (${this.maxConversationSize})`);
      }
    }
    
    const message: Message = {
      id: this.generateId(),
      role,
      content,
      timestamp: new Date().toISOString()
    };
    
    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();
    
    const filePath = join(this.conversationsPath, `${conversationId}.json`);
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    
    return message;
  }

  // List all conversations with metadata
  async listConversations(limit = 10, offset = 0): Promise<ConversationMeta[]> {
    try {
      const files = await fs.readdir(this.conversationsPath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      const metaPromises = jsonFiles.map(async (file) => {
        const filePath = join(this.conversationsPath, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const conversation = JSON.parse(data) as Conversation;
        
        return {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messageCount: conversation.messages.length,
          size: JSON.stringify(conversation).length
        };
      });
      
      const allMeta = await Promise.all(metaPromises);
      
      // Sort by updated date (newest first)
      allMeta.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      // Apply pagination
      return allMeta.slice(offset, offset + limit);
    } catch (error) {
      console.error("Error listing conversations:", error);
      return [];
    }
  }

  // Search for conversations containing a query string
  async searchConversations(query: string, limit = 5): Promise<ConversationMeta[]> {
    const lowerQuery = query.toLowerCase();
    
    try {
      const files = await fs.readdir(this.conversationsPath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      const matchPromises = jsonFiles.map(async (file) => {
        const filePath = join(this.conversationsPath, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const conversation = JSON.parse(data) as Conversation;
        
        // Search in title and message content
        const titleMatch = conversation.title.toLowerCase().includes(lowerQuery);
        const contentMatch = conversation.messages.some(msg => 
          msg.content.toLowerCase().includes(lowerQuery)
        );
        
        if (titleMatch || contentMatch) {
          return {
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messageCount: conversation.messages.length,
            size: JSON.stringify(conversation).length
          };
        }
        
        return null;
      });
      
      const results = await Promise.all(matchPromises);
      const filtered = results.filter(result => result !== null) as ConversationMeta[];
      
      // Sort by updated date (newest first)
      filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      return filtered.slice(0, limit);
    } catch (error) {
      console.error("Error searching conversations:", error);
      return [];
    }
  }

  // Validate that an ID is safe to use in a filename
  private validateId(id: string): void {
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new Error('Invalid ID format');
    }
  }
}

// Define the MCP server class
class ChatContextServer {
  private server: Server;
  private contextManager: ContextManager;

  constructor() {
    this.contextManager = new ContextManager(DEFAULT_CONFIG);

    this.server = new Server(
      {
        name: "chat-context",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupRequestHandlers();
  }

  private setupRequestHandlers() {
    // List the available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_conversation",
          description: "Create a new conversation with a title",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
            },
            required: ["title"],
          },
        },
        {
          name: "get_conversation",
          description: "Get a conversation by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
        },
        {
          name: "delete_conversation",
          description: "Delete a conversation by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
        },
        {
          name: "append_message",
          description: "Append a message to a conversation",
          inputSchema: {
            type: "object",
            properties: {
              conversationId: { type: "string" },
              role: { type: "string", enum: ["human", "assistant"] },
              content: { type: "string" },
            },
            required: ["conversationId", "role", "content"],
          },
        },
        {
          name: "list_conversations",
          description: "List conversations with pagination",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number" },
              offset: { type: "number" },
            },
          },
        },
        {
          name: "search_conversations",
          description: "Search for conversations containing a query string",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "number" },
            },
            required: ["query"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<ServerResult> => {
        const { name, arguments: args } = request.params;

        if (!args || typeof args !== "object") {
          throw new McpError(ErrorCode.InvalidParams, "Invalid arguments");
        }

        try {
          let result;

          switch (name) {
            case "create_conversation": {
              // Type checking for create_conversation
              if (typeof args.title !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, "Title must be a string");
              }
              result = await this.contextManager.createConversation(args.title);
              break;
            }

            case "get_conversation": {
              // Type checking for get_conversation
              if (typeof args.id !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, "ID must be a string");
              }
              result = await this.contextManager.getConversation(args.id);
              break;
            }

            case "delete_conversation": {
              // Type checking for delete_conversation
              if (typeof args.id !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, "ID must be a string");
              }
              await this.contextManager.deleteConversation(args.id);
              result = { success: true, message: `Conversation ${args.id} deleted` };
              break;
            }

            case "append_message": {
              // Type checking for append_message
              if (typeof args.conversationId !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, "Conversation ID must be a string");
              }
              if (typeof args.content !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, "Content must be a string");
              }
              if (args.role !== 'human' && args.role !== 'assistant') {
                throw new McpError(ErrorCode.InvalidParams, "Role must be 'human' or 'assistant'");
              }
              
              result = await this.contextManager.appendMessage(
                args.conversationId, 
                args.role as "human" | "assistant", 
                args.content
              );
              break;
            }

            case "list_conversations": {
              const limit = typeof args.limit === 'number' ? args.limit : undefined;
              const offset = typeof args.offset === 'number' ? args.offset : undefined;
              result = await this.contextManager.listConversations(limit, offset);
              break;
            }

            case "search_conversations": {
              // Type checking for search_conversations
              if (typeof args.query !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, "Query must be a string");
              }
              const limit = typeof args.limit === 'number' ? args.limit : undefined;
              result = await this.contextManager.searchConversations(args.query, limit);
              break;
            }

            default:
              throw new McpError(
                ErrorCode.MethodNotFound,
                `Unknown tool: ${name}`
              );
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          console.error("Operation error:", error);
          throw new McpError(
            ErrorCode.InternalError,
            `Operation failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Chat Context MCP server running on stdio");
  }
}

// Start the server
const server = new ChatContextServer();
server.start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});