# BillScan Worker

A Cloudflare Worker that serves as a middle layer for an automated receipt processing workflow. It bridges iOS Shortcuts, AI data extraction, and Google Sheets.

## Workflow Overview

1. **iOS Shortcut**: Captures a photo, extracts text via OCR, and prompts for the payer's name.
2. **Cloudflare Worker**: 
   - Receives the raw OCR text and payer name.
   - Calls an AI model (Cerebras/Gemini) with a specific prompt to extract line items.
   - Parses and cleans the AI-generated JSON.
   - Forwards the structured data to a Google Apps Script endpoint.
3. **Google Sheets**: Logs the items and updates totals.

## Project Structure

- `src/index.js`: Main worker logic including AI prompting and data cleaning.
- `wrangler.toml`: Configuration and environment variables (AI backend and Google Script URLs).
- `test_payload.json`: Sample data for local testing.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Setup and Installation

1. Clone or copy the project files to your local directory.
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Update the `[vars]` section in `wrangler.toml` with your specific endpoints:

```toml
[vars]
GAS_URL = "YOUR_GOOGLE_APPS_SCRIPT_EXEC_URL"
AI_BACKEND_URL = "YOUR_AI_BACKEND_URL"
```

## Local Development

Start the local development server:
```bash
npm run dev
```

Test the worker with the sample payload:
```bash
curl -X POST http://127.0.0.1:8787 \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

## Deployment

Deploy the worker to your Cloudflare account:
```bash
npm run deploy
```

## Integration with iOS Shortcuts

Update your iOS Shortcut to send a POST request to your deployed Worker URL with the following JSON structure:

```json
{
  "text": "Extracted OCR text from the receipt...",
  "paidBy": "Name of the person"
}
```
