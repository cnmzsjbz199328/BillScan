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

## Google Apps Script (Backend)

To receive data from this worker, set up a Google Apps Script in your Google Sheet:

1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Paste the following code into the script editor:

```javascript
/**
 * Receive structured JSON from the Cloudflare Worker and write to Sheet.
 */
function doPost(e) {
  try {
    if (e.postData.type !== 'application/json') {
      return ContentService.createTextOutput("Error: Not JSON data").setMimeType(ContentService.MimeType.TEXT);
    }

    var rawData = e.postData.contents;
    var jsonData;
    var paidBy = "未知";

    try {
      var requestData = JSON.parse(rawData);

      // 情况一：快捷指令错误格式 { json_data, paid_by }
      if (requestData.json_data && requestData.paid_by) {
        var cleanedPaidByString = requestData.paid_by
          .replace(/\\n/g, '')
          .replace(/\\"/g, '"');
        jsonData = JSON.parse(cleanedPaidByString);

        if (requestData.json_data.paidBy) {
          paidBy = requestData.json_data.paidBy;
        }
      }
      // 情况二：AI 直接返回数组
      else if (Array.isArray(requestData)) {
        jsonData = requestData;
        if (jsonData.length > 0 && jsonData[0].paidBy) {
          paidBy = jsonData[0].paidBy;
        }
      } else {
        throw new Error("Unsupported JSON structure.");
      }
    } catch (parseError) {
      throw new Error("JSON parse failed: " + parseError.message);
    }

    // 验证 jsonData 是否为数组
    if (!jsonData || !Array.isArray(jsonData)) {
      throw new Error("Final data is not a valid JSON array.");
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var today = new Date();

    // 遍历数据数组并写入表格
    for (var i = 0; i < jsonData.length; i++) {
      var row = jsonData[i];

      // 保底：避免缺少字段时报错
      var product = row.product || "";
      var price = row.price || 0;
      var quantity = row.quantity || 0;
      var subtotal = row.subtotal || (price * quantity);
      var finalPaidBy = row.paidBy || paidBy;

      // 在第一列加日期
      sheet.appendRow([today, product, price, quantity, subtotal, finalPaidBy]);
    }

    // 更新H列统计
    updateTotalsInSameSheet(sheet);

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}

// 更新总计，写在主表 H、I 列
function updateTotalsInSameSheet(sheet) {
  var data = sheet.getDataRange().getValues();

  // 假设表结构：A=日期, B=商品, C=价格, D=数量, E=小计, F=付款人
  var paidByIndex = 5; 
  var subtotalIndex = 4; 

  var totals = {};
  var grandTotal = 0;

  // 从第二行开始遍历数据（跳过表头时可改 i=1）
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var person = row[paidByIndex];
    var amount = row[subtotalIndex];

    if (person && typeof amount === 'number') {
      if (!totals[person]) {
        totals[person] = 0;
      }
      totals[person] += amount;
      grandTotal += amount;
    }
  }

  // 清除旧的 H:I 统计区域
  sheet.getRange('H:I').clearContent();

  var row = 1;
  sheet.getRange('H' + row).setValue("姓名");
  sheet.getRange('I' + row).setValue("总消费");
  row++;

  // 写入总消费
  sheet.getRange('H' + row).setValue("全部合计");
  sheet.getRange('I' + row).setValue(grandTotal);
  row++;

  // 写入每个人的消费
  for (var person in totals) {
    if (totals.hasOwnProperty(person)) {
      sheet.getRange('H' + row).setValue(person);
      sheet.getRange('I' + row).setValue(totals[person]);
      row++;
    }
  }
}
```

4. Click **Deploy > New Deployment**.
5. Select type **Web App**.
6. Set **Execute as** to "Me" and **Who has access** to "Anyone".
7. Copy the **Web App URL** and paste it into your `wrangler.toml` as `GAS_URL`.
