# MCP Transaction Analyzer

A Model Context Protocol (MCP) server that provides AI-powered analysis of Ethereum transactions across any network. This service simulates transactions and generates human-readable interpretations to help users understand potential outcomes before execution.

## Overview

The MCP Transaction Analyzer combines blockchain transaction simulation with AI interpretation.
- What a transaction will do before they execute it
- The potential impact on token balances
- Any hidden or unexpected outcomes
- Gas usage and cost estimates

## Features

- Real-time transaction simulation using Tenderly
- AI-powered interpretation using OpenAI or Google's Gemini models
- Support for all Ethereum-compatible networks
- Detailed analysis of:
  - ERC20, ERC721, and ERC1155 token transfers
  - Contract interactions
  - Balance changes
  - Gas estimations
- Secure HTTPS support in production
- Server-Sent Events (SSE) for real-time updates
- Full Model Context Protocol integration

## Prerequisites

- Node.js >= 18.x
- SSL certificates (for production mode)
- API keys for:
  - Tenderly (transaction simulation)
  - OpenAI and/or Google Gemini (AI interpretation)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd mcp-transaction-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables in `.env`:
```env
TENDERLY_ACCOUNT=your_tenderly_account
TENDERLY_PROJECT=your_tenderly_project
TENDERLY_API_KEY=your_tenderly_api_key
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
CERT_PATH=/path/to/ssl/certificates  # Required for production
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run prod
```

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run development server
- `npm run dev:prod` - Run production server with TypeScript
- `npm run start` - Start compiled server
- `npm run prod` - Run compiled server in production mode
- `npm run inspect` - Run MCP inspector on the server

## API

### Endpoints

#### SSE Connection
GET /sse
```
Establishes Server-Sent Events connection for real-time updates

#### Message Processing
```
POST /messages?sessionId={sessionId}
```
Handles message processing for specific sessions

### Transaction Simulation

The service accepts transaction parameters and returns detailed analysis:

```typescript
{
  networkId: string,    // Network ID for the transaction
  from: string,        // Sender address
  to: string,          // Recipient address
  value?: string,      // ETH value (optional)
  data?: string,       // Transaction data (optional)
  useEmojis?: boolean  // Enable/disable emojis in response
}
```

## Security

- HTTPS encryption in production
- CORS protection
- Environment variable security
- API key validation
- Session-based connections

## Dependencies

### Core
- `@modelcontextprotocol/sdk`: MCP integration
- `ethers`: Ethereum interaction
- `@smarttokenlabs/waterfall-rpc`: RPC management

### AI Services
- `@anthropic-ai/sdk`: Anthropic AI integration
- `@google/generative-ai`: Google Gemini integration
- `openai`: OpenAI integration

### Server
- `express`: Web server framework
- `@fastify/cors`: CORS support

### Development
- `typescript`: Type safety
- `ts-node`: TypeScript execution
- Various type definitions

## Development

The project follows TypeScript best practices and is structured around:
- `server.ts`: Main MCP server implementation
- `processTransaction.ts`: Transaction analysis logic
- `tenderly.ts`: Tenderly API integration

## License

MIT License

## Author

James Brown (j@smarttokenlabs.com)

## Support

For issues and feature requests, please create an issue in the repository.
