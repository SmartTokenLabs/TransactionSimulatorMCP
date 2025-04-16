import express, { Request, Response } from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { z } from "zod";
import dotenv from "dotenv";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import https from 'https';
import fs from 'fs';
import { processTransactionData, useOpenAI } from "./processTransaction";
import { getTenderlyResponse } from "./tenderly";

dotenv.config();

//Create an MCP server
const server = new McpServer({
  name: "Ethereum Transaction Analyzer",
  version: "0.9.0",
  timeout: 60000 // 1 minute in milliseconds
});

// Create transport
const transport = new StdioServerTransport();

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: {[sessionId: string]: SSEServerTransport} = {};

// Helper function to send log messages through MCP
async function sendLogMessage(message: string, ...args: any[]) {
  const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
  await server.tool("log", (extra: any) => ({
    content: [{
      type: "text",
      text: formattedMessage
    }]
  }));
}

const app = express();

app.use(cors({
  origin: '*', // or specify your allowed origins
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.get("/sse", async (_: Request, res: Response) => {
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

// Tool to simulate a transaction
server.tool(
  "simulate-transaction",
  {
    networkId: z.string(),
    from: z.string(),
    to: z.string(),
    value: z.string().optional(),
    data: z.string().optional(),
    useEmojis: z.boolean().optional()
  },
  async ({ from, to, value, data, networkId, useEmojis }: {
    from: string;
    to: string;
    value?: string;
    data?: string;
    networkId: string;
    useEmojis?: boolean;
  }) => {
    try {
      // Create transaction object
      const tx = {
        from: from,
        to,
        value: value ? value : "0",
        data: data || '0x',
        networkId: networkId
      };

      useEmojis = useEmojis === undefined ? true : useEmojis;

      let preProcessedResult = null;
      let aiInterpretation = null;

      if (tx.data !== '0x') {
        const response: JSON = await getTenderlyResponse(tx);
        preProcessedResult = await processTransactionData(response);
        aiInterpretation = await useOpenAI(preProcessedResult, useEmojis);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            aiInterpretation: aiInterpretation,
            preProcessedResult: preProcessedResult
          }, null, 2)
        }]
      };
    } catch (error) {
      console.error(error);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }],
        isError: true
      };
    }
  }
);

// Start the server
const start = async () => {
  try {
    await server.connect(transport);
    
    if (process.env.NODE_ENV === 'production') {
      const sslOptions = {
        key: fs.readFileSync(`${process.env.CERT_PATH}/privkey.pem`),
        cert: fs.readFileSync(`${process.env.CERT_PATH}/fullchain.pem`)
      };

      // Create HTTPS server
      const httpsServer = https.createServer(sslOptions, app);
      
      httpsServer.listen(8084, () => {
        console.log(`HTTPS server listening on port 8084`);
        sendLogMessage(`MCP server started on port ${8084}`);
      });
    } else {
      await sendLogMessage("MCP server started in development mode");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();