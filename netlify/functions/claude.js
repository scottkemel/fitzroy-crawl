exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No body received" }),
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "API key not configured" }),
      };
    }

    const body = JSON.parse(event.body);
    let messages = body.messages || [];
    const tools = body.tools || [];

    // Agentic loop — handles tool use (e.g. web search) until end_turn
    let finalData = null;
    for (let i = 0; i < 5; i++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: body.model || "claude-sonnet-4-5",
          max_tokens: body.max_tokens || 1000,
          tools: tools,
          messages: messages,
        }),
      });

      finalData = await response.json();

      if (!response.ok) {
        return {
          statusCode: response.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(finalData),
        };
      }

      // If stop reason is end_turn or no tool_use blocks, we're done
      const hasToolUse = finalData.content && finalData.content.some(b => b.type === "tool_use");
      if (finalData.stop_reason === "end_turn" || !hasToolUse) {
        break;
      }

      // Append assistant turn
      messages = [...messages, { role: "assistant", content: finalData.content }];

      // Return empty tool results so the loop continues to the final answer
      const toolResults = finalData.content
        .filter(b => b.type === "tool_use")
        .map(b => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: "Search results processed.",
        }));

      messages = [...messages, { role: "user", content: toolResults }];
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(finalData),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
