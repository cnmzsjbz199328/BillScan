export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed. Please use POST.", { status: 405 });
    }

    try {
      // 1. Get data from iOS Shortcut
      const { text, paidBy } = await request.json();
      
      if (!text) {
        return new Response("Missing 'text' in request body", { status: 400 });
      }

      // 2. Prepare Prompt
      const systemPrompt = `You are an expert data extractor for receipts and invoices.
Your task is to accurately identify and extract specific line item details from the provided raw text.
You MUST only identify and extract the following details for EACH line item:
- product (name)
- price (unit price, number)
- quantity (number)
- subtotal (price * quantity, number)
- paidBy (use the value: "${paidBy || 'Unknown'}")

Return ONLY a valid JSON array. Each object should have keys: "product", "price", "quantity", "subtotal", "paidBy".
DO NOT include markdown code blocks or any other text.`;

      // 3. Call AI Backend
      const aiResponse = await fetch(env.AI_BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a helpful assistant that outputs JSON." },
            { role: "user", content: `${systemPrompt}\n\nRaw Text:\n${text}` }
          ]
        })
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`AI Backend returned ${aiResponse.status}: ${errText}`);
      }

      const aiData = await aiResponse.json();
      
      // Extract content - handling potential variations in AI response structure
      let content = "";
      if (aiData.choices && aiData.choices[0] && aiData.choices[0].message) {
        content = aiData.choices[0].message.content;
      } else if (aiData.content) {
        content = aiData.content;
      } else {
        throw new Error("Unexpected AI response format");
      }

      // Clean AI output (remove markdown code blocks if present)
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();

      let extractedItems;
      try {
        extractedItems = JSON.parse(content);
      } catch (e) {
        throw new Error("Failed to parse AI output as JSON: " + content);
      }

      if (!Array.isArray(extractedItems)) {
        extractedItems = [extractedItems];
      }

      // 4. Forward to Google Apps Script
      const gasResponse = await fetch(env.GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extractedItems)
      });

      const gasResult = await gasResponse.text();

      return new Response(JSON.stringify({
        status: "success",
        message: "Data processed and sent to GAS",
        gasResponse: gasResult,
        itemsCount: extractedItems.length
      }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Worker Error:", error);
      return new Response(JSON.stringify({
        status: "error",
        message: error.message
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
